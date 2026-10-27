import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const BASE = import.meta.env.BASE_URL;
const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const texLoader = new THREE.TextureLoader();

export const models = new Map<string, GLTF>();
let anisotropy = 4;
export function setAnisotropy(n: number) { anisotropy = n; }

export async function loadModels(names: string[], onProgress: (done: number, total: number) => void) {
  let done = 0;
  await Promise.all(names.map(async (n) => {
    try {
      const gltf = await gltfLoader.loadAsync(`${BASE}models/${n}.glb`);
      gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) fixNormals((o as THREE.Mesh).geometry); });
      models.set(n, gltf);
    } catch (e) {
      console.warn('model failed', n, e);
    }
    onProgress(++done, names.length);
  }));
}

/**
 * Some generated meshes contain a few zero-length normals. normalize(0) is NaN in the
 * shader, and bloom then smears that NaN across the whole frame. Replace just those
 * entries with computed smooth normals.
 */
function fixNormals(geo: THREE.BufferGeometry) {
  const n = geo.attributes.normal as THREE.BufferAttribute | undefined;
  if (!n) return;
  const bad: number[] = [];
  for (let i = 0; i < n.count; i++) {
    const x = n.getX(i), y = n.getY(i), z = n.getZ(i);
    if (!(x * x + y * y + z * z > 1e-6)) bad.push(i);
  }
  if (!bad.length) return;
  const tmp = new THREE.BufferGeometry();
  tmp.setAttribute('position', geo.attributes.position);
  if (geo.index) tmp.setIndex(geo.index);
  tmp.computeVertexNormals();
  const smooth = tmp.attributes.normal as THREE.BufferAttribute;
  const fixed = new THREE.BufferAttribute(new Float32Array(n.count * 3), 3);
  for (let i = 0; i < n.count; i++) fixed.setXYZ(i, n.getX(i), n.getY(i), n.getZ(i));
  for (const i of bad) {
    const x = smooth.getX(i), y = smooth.getY(i), z = smooth.getZ(i);
    if (x * x + y * y + z * z > 1e-6) fixed.setXYZ(i, x, y, z);
    else fixed.setXYZ(i, 0, 1, 0);
  }
  geo.setAttribute('normal', fixed);
}

export interface PropOptions {
  /** Target size in meters along `axis` (default: height). */
  size: number;
  axis?: 'x' | 'y' | 'z' | 'max';
  shadows?: boolean;
  tint?: THREE.ColorRepresentation;
  roughness?: number;
}

/**
 * Clones a loaded prop, scales it to real-world size and sits it on y = 0 with its
 * footprint centered. Returns a wrapper group so callers can position/rotate freely.
 */
export function prop(name: string, o: PropOptions): THREE.Group {
  const g = new THREE.Group();
  const src = models.get(name);
  if (!src) {
    const fallback = new THREE.Mesh(new THREE.BoxGeometry(0.5, o.size, 0.5), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    fallback.position.y = o.size / 2;
    g.add(fallback);
    return g;
  }
  const obj = src.scene.clone(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const axis = o.axis ?? 'y';
  const ref = axis === 'max' ? Math.max(size.x, size.y, size.z) : size[axis];
  const s = o.size / ref;
  obj.scale.setScalar(s);
  const center = box.getCenter(new THREE.Vector3());
  obj.position.set(-center.x * s, -box.min.y * s, -center.z * s);
  obj.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = o.shadows ?? true;
    m.receiveShadow = true;
    const mat = (m.material as THREE.MeshStandardMaterial).clone();
    if (o.tint) mat.color.multiply(new THREE.Color(o.tint));
    if (o.roughness !== undefined) mat.roughness = o.roughness;
    tuneMaterial(mat);
    m.material = mat;
  });
  g.add(obj);
  g.userData.size = size.multiplyScalar(s);
  return g;
}

function tuneMaterial(mat: THREE.MeshStandardMaterial) {
  for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap'] as const) {
    const t = mat[k];
    if (t) t.anisotropy = anisotropy;
  }
  // Meshy PBR sometimes comes out fully metallic; old furniture is mostly wood.
  mat.envMapIntensity = 0.6;
}

// ---------------------------------------------------------------------------
// Characters

export interface CharacterAsset {
  scene: THREE.Object3D;
  clips: Record<string, THREE.AnimationClip>;
}

/** Strip root motion from a clip so the character animates in place. */
function inPlace(clip: THREE.AnimationClip): THREE.AnimationClip {
  const c = clip.clone();
  for (const tr of c.tracks) {
    if (/Hips\.position$/.test(tr.name)) {
      const v = tr.values;
      const x0 = v[0], z0 = v[2];
      for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
    }
  }
  return c;
}

/** Rotate the whole clip about Y so the hips face +Z on the first frame (library idles stand at an angle). */
function faceForward(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tr = clip.tracks.find((t) => /Hips\.quaternion$/.test(t.name));
  if (!tr) return clip;
  const v = tr.values;
  const q0 = new THREE.Quaternion(v[0], v[1], v[2], v[3]);
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q0);
  const fix = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(f.x, f.z));
  const q = new THREE.Quaternion();
  for (let i = 0; i < v.length; i += 4) {
    q.set(v[i], v[i + 1], v[i + 2], v[i + 3]).premultiply(fix);
    v[i] = q.x; v[i + 1] = q.y; v[i + 2] = q.z; v[i + 3] = q.w;
  }
  return clip;
}

/** Named clips: walk/run come from Meshy rigging; the rest from the animation API in action order. */
export function character(name: string, extraNames: string[]): CharacterAsset | null {
  const src = models.get(name);
  if (!src) return null;
  const scene = SkeletonUtils.clone(src.scene);
  scene.traverse((c) => {
    const m = c as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false; // skinned bounds don't follow the animation
    const mat = (m.material as THREE.MeshStandardMaterial).clone();
    tuneMaterial(mat);
    m.material = mat;
  });
  const clips: Record<string, THREE.AnimationClip> = {};
  const walk = models.get(`${name}_walk`)?.animations[0];
  const run = models.get(`${name}_run`)?.animations[0];
  if (walk) clips.walk = inPlace(walk);
  if (run) clips.run = inPlace(run);
  const extra = models.get(`${name}_anims`)?.animations ?? [];
  extra.forEach((a, i) => {
    const n = extraNames[i];
    if (!n) return;
    clips[n] = n === 'idle' || n === 'stalk' ? faceForward(inPlace(a)) : inPlace(a);
  });
  return { scene, clips };
}

// ---------------------------------------------------------------------------
// PBR texture sets from Poly Haven (diffuse / normal / packed AO-rough-metal)

const texCache = new Map<string, THREE.MeshStandardMaterial>();

export function pbr(name: string, repeat: [number, number] = [1, 1], extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const key = `${name}:${repeat.join('x')}:${JSON.stringify(extra)}`;
  const cached = texCache.get(key);
  if (cached) return cached;
  const load = (suffix: string, srgb: boolean) => {
    const t = texLoader.load(`${BASE}textures/${name}_${suffix}.webp`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = anisotropy;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const arm = load('arm', false);
  const mat = new THREE.MeshStandardMaterial({
    map: load('diff', true),
    normalMap: load('nor', false),
    aoMap: arm,
    roughnessMap: arm,
    metalnessMap: arm,
    metalness: 1, // metalness map drives it
    roughness: 1,
    ...extra,
  });
  texCache.set(key, mat);
  return mat;
}
