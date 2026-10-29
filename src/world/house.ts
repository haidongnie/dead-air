import * as THREE from 'three';
import { pbr, prop } from '../core/assets';
import {
  WALLS, ROOMS, H, WALL_T, BASEMENT_Y, BASEMENT_CEIL, STAIRS, PORCH, DOORS, DOOR_H,
  wallBoxes, colliders, addCollider, type Box,
} from './layout';

// Builds the Whitlock house: shell geometry with world-scaled UVs, Meshy props,
// practical lights, and handles to everything the game animates or interacts with.

export interface Lamp { light: THREE.PointLight; bulb: THREE.Mesh; base: number; phase: number; basement: boolean; }

export interface World {
  group: THREE.Group;
  lamps: Lamp[];
  tvScreen: THREE.Mesh; tvCanvas: HTMLCanvasElement; tvTexture: THREE.CanvasTexture; tvLight: THREE.PointLight;
  radioDial: THREE.MeshStandardMaterial;
  frontDoor: THREE.Group; chains: THREE.Group; basementDoor: THREE.Group;
  clockDoor: THREE.Group; clockCavity: THREE.Mesh;
  safeDoor: THREE.Group; safeCavity: THREE.Mesh; journal: THREE.Mesh;
  fuseSlots: THREE.Mesh[]; lever: THREE.Group;
  valveWheels: Record<'a' | 'b', THREE.Object3D>;
  pickups: Record<string, THREE.Object3D>;
  altarSlots: Record<string, THREE.Vector3>;
  altarItems: Record<string, THREE.Object3D>;
  candleLight: THREE.PointLight; candleFlames: THREE.Mesh[];
  transmitterGlow: THREE.MeshStandardMaterial;
  outside: THREE.MeshBasicMaterial; lightning: THREE.DirectionalLight;
  police: THREE.PointLight;
  phone: THREE.Vector3;
}

// Positions of every interactive thing, shared with the interaction system.
export const SPOTS = {
  fuse1: new THREE.Vector3(-7.55, 1.42, 3.0),
  fuse2: new THREE.Vector3(-2.1, 1.03, -6.25),
  fuse3: new THREE.Vector3(4.9, 0.03, 3.35),
  fuseBox: new THREE.Vector3(6.27, 1.35, -3.6),
  radio: new THREE.Vector3(-3.2, 0.9, 0.4),
  tv: new THREE.Vector3(-2.15, 0.8, 6.25),
  safe: new THREE.Vector3(-2.1, 0.55, -6.25),
  key: new THREE.Vector3(0, 0, 0), // set from the safe's front face below
  musicbox: new THREE.Vector3(0, 0, 0),
  journal: new THREE.Vector3(0, 0, 0),
  doll: new THREE.Vector3(-6.55, 0.52, 1.25),
  clock: new THREE.Vector3(-1.1, 1.1, 1.8),
  watch: new THREE.Vector3(-0.84, 0.78, 1.8),
  basementDoor: new THREE.Vector3(6.4, 1.1, -6.2),
  frontDoor: new THREE.Vector3(0, 1.1, 6.9),
  valveA: new THREE.Vector3(3.5, BASEMENT_Y + 1.25, -6.7),
  valveB: new THREE.Vector3(-3.5, BASEMENT_Y + 1.25, -0.3),
  altar: new THREE.Vector3(-6.85, BASEMENT_Y + 0.85, -3.5),
  newspaper: new THREE.Vector3(1.05, 0.92, 2.4),
  sermon: new THREE.Vector3(-4.6, 0.82, -6.25),
  ruth: new THREE.Vector3(3.6, 0.8, -3.4),
  log: new THREE.Vector3(-5.0, BASEMENT_Y + 1.05, -6.3),
};

// The safe sits in the study corner, angled toward the room.
const SAFE = { x: -2.1, z: -6.25, rot: -0.5, depth: 0.74 };
const SAFE_FWD = new THREE.Vector3(Math.sin(SAFE.rot), 0, Math.cos(SAFE.rot));
const SAFE_RIGHT = new THREE.Vector3(Math.cos(SAFE.rot), 0, -Math.sin(SAFE.rot));
const SAFE_FRONT = new THREE.Vector3(SAFE.x, 0, SAFE.z).addScaledVector(SAFE_FWD, SAFE.depth / 2 + 0.01);
SPOTS.key.copy(SAFE_FRONT).addScaledVector(SAFE_FWD, 0.05).setY(0.66);
SPOTS.musicbox.copy(SAFE_FRONT).addScaledVector(SAFE_FWD, 0.07).addScaledVector(SAFE_RIGHT, -0.08).setY(0.3);
SPOTS.journal.copy(SAFE_FRONT).addScaledVector(SAFE_FWD, 0.05).addScaledVector(SAFE_RIGHT, 0.14).setY(0.33);

// ---------------------------------------------------------------------------
// geometry helpers

/** Box whose UVs are in meters / tile, so one material tiles evenly on any size. */
function worldBox(w: number, h: number, d: number, tile: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // face order: +x, -x, +y, -y, +z, -z (4 verts each)
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0] / tile, uv.getY(k) * dims[f][1] / tile);
    }
  }
  return g;
}

function plane(w: number, d: number, tile: number, mat: THREE.Material): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * d / tile);
  const m = new THREE.Mesh(g, mat);
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

function box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, tile = 1, shadow = true) {
  const m = new THREE.Mesh(worldBox(w, h, d, tile), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function place(parent: THREE.Object3D, obj: THREE.Object3D, x: number, y: number, z: number, rotY = 0) {
  obj.position.set(x, y, z);
  obj.rotation.y = rotY;
  parent.add(obj);
  return obj;
}

/** Footprint collider for a placed prop (axis-aligned, so pass the rotated size). */
function solid(x: number, z: number, w: number, d: number, y0 = 0, y1 = 2, id?: string): Box {
  return addCollider({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0, y1, id });
}

// ---------------------------------------------------------------------------

export function buildHouse(scene: THREE.Scene): World {
  const group = new THREE.Group();
  scene.add(group);
  colliders.length = 0;
  colliders.push(...wallBoxes());

  const M = {
    wallpaper: pbr('wallpaper', [1 / 1.6, 1 / 1.6], { metalness: 0 }),
    stone: pbr('stonewall', [1 / 2.2, 1 / 2.2], { metalness: 0 }),
    siding: pbr('siding', [1 / 2, 1 / 2], { metalness: 0 }),
    woodfloor: pbr('woodfloor', [1 / 2.2, 1 / 2.2], { metalness: 0 }),
    linoleum: pbr('linoleum', [1 / 1.5, 1 / 1.5], { metalness: 0 }),
    concrete: pbr('concrete', [1 / 3, 1 / 3], { metalness: 0 }),
    ceiling: pbr('ceiling', [1 / 2, 1 / 2], { metalness: 0 }),
    trim: pbr('darkwood', [1 / 1.2, 1 / 1.2], { metalness: 0 }),
    porch: pbr('porch', [1 / 1.8, 1 / 1.8], { metalness: 0 }),
    carpet: pbr('carpet', [1 / 1.4, 1 / 1.4], { metalness: 0 }),
    rust: pbr('rust', [1, 1]),
  };

  // --- walls, with baseboards, crown molding and door casings -------------------
  for (const w of WALLS) {
    const horizontal = w.a[1] === w.b[1];
    const lo = horizontal ? Math.min(w.a[0], w.b[0]) : Math.min(w.a[1], w.b[1]);
    const hi = horizontal ? Math.max(w.a[0], w.b[0]) : Math.max(w.a[1], w.b[1]);
    const fixed = horizontal ? w.a[1] : w.a[0];
    const mat = M[w.mat];
    // One straight piece of wall between s and e along the wall's axis. Structural
    // pieces overlap by half a thickness at each end to close corners; trim pieces
    // (extra > 0) are slightly thicker so they stand proud of the wall surface.
    const seg = (s: number, e: number, y0: number, y1: number, m: THREE.Material, extra = 0) => {
      if (e - s < 0.01 || y1 - y0 < 0.01) return;
      // structural pieces overlap half a thickness only at the wall's ends (closing corners),
      // so doorways keep their full width, matching the colliders in layout.wallBoxes()
      if (!extra) { if (s === lo) s -= WALL_T / 2; if (e === hi) e += WALL_T / 2; }
      const len = e - s;
      const thick = WALL_T + extra;
      const c = (s + e) / 2;
      box(group, horizontal ? len : thick, y1 - y0, horizontal ? thick : len,
        horizontal ? c : fixed, (y0 + y1) / 2, horizontal ? fixed : c, m, 1, !extra);
    };
    const ops = [...(w.openings ?? [])].sort((p, q) => p.from - q.from);
    let cursor = lo;
    for (const o of ops) {
      seg(cursor, o.from, w.y0, w.y1, mat);
      const top = o.top ?? DOOR_H;
      seg(o.from, o.to, w.y0 + top, w.y1, mat);
      if (o.bottom) seg(o.from, o.to, w.y0, w.y0 + o.bottom, mat);
      cursor = o.to;
      if (w.mat === 'wallpaper') {
        // casing around the opening
        const cy0 = w.y0 + (o.bottom ?? 0);
        const cy1 = w.y0 + top;
        // the trim wraps 4 mm into the opening so it never shares a plane with the reveal (z-fighting)
        seg(o.from - 0.09, o.from + 0.004, cy0, cy1 + 0.09, M.trim, 0.06);
        seg(o.to - 0.004, o.to + 0.09, cy0, cy1 + 0.09, M.trim, 0.06);
        seg(o.from - 0.09, o.to + 0.09, cy1 - 0.004, cy1 + 0.09, M.trim, 0.06);
        if (o.bottom) seg(o.from - 0.12, o.to + 0.12, cy0 - 0.05, cy0 + 0.004, M.trim, 0.12);
      }
    }
    seg(cursor, hi, w.y0, w.y1, mat);
    if (w.mat === 'wallpaper') {
      // baseboard and crown follow the solid pieces only
      let c2 = lo;
      for (const o of ops.filter((o) => !o.bottom)) { seg(c2, o.from, w.y0, w.y0 + 0.14, M.trim, 0.04); c2 = o.to; }
      seg(c2, hi, w.y0, w.y0 + 0.14, M.trim, 0.04);
      seg(lo, hi, w.y1 - 0.1, w.y1, M.trim, 0.05);
    }
  }

  // --- floors and ceilings --------------------------------------------------------
  for (const r of ROOMS) {
    const f = plane(r.x1 - r.x0, r.z1 - r.z0, 1, M[r.floor]);
    f.position.set((r.x0 + r.x1) / 2, r.y + 0.001, (r.z0 + r.z1) / 2);
    group.add(f);
  }
  const ceil = plane(16.4, 14.4, 1, M.ceiling);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, H, 0);
  group.add(ceil);
  // basement ceiling: joists over planks, with an opening above the stairs
  const bceil = plane(14.4, 7, 1, M.trim);
  bceil.rotation.x = Math.PI / 2;
  bceil.position.set(-0.8, BASEMENT_CEIL, -3.5);
  group.add(bceil);
  const bceil2 = plane(1.6, 1, 1, M.trim);
  bceil2.rotation.x = Math.PI / 2;
  bceil2.position.set(7.2, BASEMENT_CEIL, -0.5);
  group.add(bceil2);
  for (let x = -7.6; x < 6.4; x += 0.8) box(group, 0.1, 0.22, 7, x, BASEMENT_CEIL - 0.11, -3.5, M.trim, 1, false);
  // floor slab edge visible from the stairwell
  box(group, 1.6, 0.3, 0.05, 7.2, -0.15, -1.6, M.trim, 1, false);
  // kitchen floor slab cutout: underside of landing
  box(group, 1.6, 0.3, 1.4, 7.2, -0.15, -6.3, M.trim, 1, false);

  // --- stairs to the basement ----------------------------------------------------
  const steps = 14;
  const run = (STAIRS.zBottom - STAIRS.zTop) / steps;
  for (let i = 0; i < steps; i++) {
    const yTop = -(i + 1) * (3 / steps);
    const z = STAIRS.zTop + (i + 0.5) * run;
    box(group, 1.5, 0.06, run + 0.04, 7.2, yTop + 0.03 + 3 / steps * 0.5, z, M.trim, 1);
    box(group, 1.5, 3 / steps, 0.03, 7.2, yTop + 3 / steps, z - run / 2, M.trim, 1);
  }
  // stringer under the stairs (solid triangle approximated by a tilted slab)
  const stringer = box(group, 0.08, 0.4, 4.6, 6.48, -1.6, (STAIRS.zTop + STAIRS.zBottom) / 2, M.trim, 1);
  stringer.rotation.x = Math.atan2(3, 4);
  const rail = box(group, 0.06, 0.06, 5, 6.5, -0.65, (STAIRS.zTop + STAIRS.zBottom) / 2, M.trim, 1, false);
  rail.rotation.x = Math.atan2(3, 4);
  for (let i = 0; i < 6; i++) {
    const z = STAIRS.zTop + 0.3 + i * 0.75;
    const y = (z - STAIRS.zTop) / (STAIRS.zBottom - STAIRS.zTop) * BASEMENT_Y;
    box(group, 0.04, 0.95, 0.04, 6.5, y + 0.48, z, M.trim, 1, false);
  }

  // --- porch and the night outside -------------------------------------------------
  const porch = plane(PORCH.x1 - PORCH.x0 + 1, PORCH.z1 - 7 + 0.5, 1, M.porch);
  porch.position.set(0, -0.05, (7 + PORCH.z1) / 2);
  group.add(porch);
  for (const x of [PORCH.x0, PORCH.x1]) {
    box(group, 0.12, 2.6, 0.12, x, 1.25, PORCH.z1, M.trim);
    box(group, 0.08, 0.08, PORCH.z1 - 7, x, 0.9, (7 + PORCH.z1) / 2, M.trim, 1, false);
  }
  box(group, PORCH.x1 - PORCH.x0 + 0.6, 0.1, PORCH.z1 - 7 + 0.4, 0, 2.6, (7 + PORCH.z1) / 2, M.trim);
  // exterior siding visible from the porch
  box(group, 16.4, 3.4, 0.06, 0, 1.4, 7.14, M.siding, 1, false).visible = true;
  // the yard: a fogged void with a gradient "sky"
  const outside = new THREE.MeshBasicMaterial({ color: 0x0b1420, fog: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(40, 16, 8), outside);
  sky.material = outside;
  outside.side = THREE.BackSide;
  group.add(sky);
  const yard = plane(60, 60, 4, new THREE.MeshStandardMaterial({ color: 0x0c0f0a, roughness: 1 }));
  yard.position.y = -0.4;
  group.add(yard);

  // --- windows: frames, dirty glass, and moonlit outside plates ---------------------
  const glass = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.35 });
  for (const w of WALLS) {
    if (!w.exterior || w.mat !== 'wallpaper') continue;
    const horizontal = w.a[1] === w.b[1];
    const fixed = horizontal ? w.a[1] : w.a[0];
    for (const o of w.openings ?? []) {
      if (!o.bottom) continue;
      const c = (o.from + o.to) / 2, wd = o.to - o.from, ht = (o.top ?? 2.2) - o.bottom;
      const y = (o.top! + o.bottom) / 2;
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(wd, ht), glass);
      const out = new THREE.Mesh(new THREE.PlaneGeometry(wd * 2.2, ht * 2.2), outside);
      const sign = horizontal ? Math.sign(fixed) : Math.sign(fixed);
      if (horizontal) {
        pane.position.set(c, y, fixed); pane.rotation.y = sign > 0 ? Math.PI : 0;
        out.position.set(c, y, fixed + sign * 0.8); out.rotation.y = sign > 0 ? Math.PI : 0;
      } else {
        pane.position.set(fixed, y, c); pane.rotation.y = sign > 0 ? -Math.PI / 2 : Math.PI / 2;
        out.position.set(fixed + sign * 0.8, y, c); out.rotation.y = sign > 0 ? -Math.PI / 2 : Math.PI / 2;
      }
      group.add(pane, out);
      // muntins
      const mx = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? wd : 0.05, 0.05, horizontal ? 0.05 : wd), M.trim);
      mx.position.copy(pane.position);
      const my = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? 0.05 : 0.05, ht, 0.05), M.trim);
      my.position.copy(pane.position);
      group.add(mx, my);
      // torn curtains
      const curtain = new THREE.MeshStandardMaterial({ color: 0x3a2622, roughness: 0.95, side: THREE.DoubleSide });
      for (const side of [-1, 1]) {
        const cm = new THREE.Mesh(new THREE.PlaneGeometry(0.45, ht + 0.6, 4, 8), curtain);
        const pos = cm.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 18 + pos.getY(i) * 2) * 0.04);
        cm.geometry.computeVertexNormals();
        const inward = -Math.sign(fixed) * 0.13;
        const along = c + side * (wd / 2 + 0.05);
        if (horizontal) { cm.position.set(along, y + 0.15, fixed + inward); cm.rotation.y = pane.rotation.y; }
        else { cm.position.set(fixed + inward, y + 0.15, along); cm.rotation.y = pane.rotation.y; }
        group.add(cm);
      }
    }
  }

  // --- lights --------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0x5a6e8c, 0x0a0806, 0.32);
  scene.add(hemi);
  const lightning = new THREE.DirectionalLight(0xc8d8ff, 0);
  lightning.position.set(-10, 12, 14);
  scene.add(lightning);

  const lamps: Lamp[] = [];
  const bulbMat = () => new THREE.MeshStandardMaterial({ color: 0x222018, emissive: 0xffb060, emissiveIntensity: 0 });
  const addLamp = (x: number, y: number, z: number, intensity: number, dist: number, kind: 'pendant' | 'bulb' | 'floor', basement = false) => {
    const light = new THREE.PointLight(0xffa860, 0, dist, 2);
    light.position.set(x, y, z);
    group.add(light);
    let bulb: THREE.Mesh;
    if (kind === 'pendant') {
      const shade = prop('pendant_lamp', { size: 0.5, axis: 'max', shadows: false });
      place(group, shade, x, y - 0.05, z);
      // pendant models hang from the ceiling: sit the top of the model on the ceiling
      shade.position.y = y + 0.32 - (shade.userData.size?.y ?? 0.4);
      bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), bulbMat());
      bulb.position.set(x, shade.position.y + 0.06, z);
      light.position.y = bulb.position.y - 0.05;
    } else if (kind === 'floor') {
      const lamp = prop('floor_lamp', { size: 1.65, shadows: true });
      place(group, lamp, x, 0, z);
      bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), bulbMat());
      bulb.position.set(x, 1.35, z);
      light.position.set(x, 1.45, z);
    } else {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.5), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      cord.position.set(x, y + 0.25, z);
      group.add(cord);
      bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), bulbMat());
      bulb.position.set(x, y, z);
    }
    group.add(bulb);
    lamps.push({ light, bulb, base: intensity, phase: Math.random() * 100, basement });
  };
  addLamp(0, H, 3.4, 5, 9, 'pendant');
  addLamp(-7.3, 0, 6.3, 4, 8, 'floor');
  addLamp(-4.6, H, -3.4, 4.5, 8, 'pendant');
  addLamp(4.7, H, 3.6, 5, 8, 'pendant');
  addLamp(3.8, H, -3.4, 5, 8, 'pendant');
  addLamp(-0.5, BASEMENT_CEIL - 0.55, -3.4, 4, 10, 'bulb', true);

  // --- hall ----------------------------------------------------------------------
  const clock = prop('grandfather_clock', { size: 2.15 });
  place(group, clock, -1.08, 0, 1.8, Math.PI / 2);
  solid(-1.08, 1.8, 0.42, 0.55);
  // the clock's case door: a hinged glass panel we can swing open
  const cavityMat = new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 1 });
  const clockCavity = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.8), cavityMat);
  clockCavity.position.set(-0.885, 0.75, 1.8);
  clockCavity.rotation.y = Math.PI / 2;
  clockCavity.visible = false;
  group.add(clockCavity);
  const clockDoor = new THREE.Group();
  clockDoor.position.set(-0.88, 0.35, 1.67);
  const cdPanel = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.8, 0.26), new THREE.MeshStandardMaterial({ color: 0x3a1f10, roughness: 0.35, metalness: 0.1 }));
  cdPanel.position.set(0.01, 0.4, 0.13);
  clockDoor.add(cdPanel);
  clockDoor.visible = false;
  group.add(clockDoor);

  place(group, prop('coat_rack', { size: 1.85 }), 1.05, 0, 6.35);
  solid(1.05, 6.35, 0.45, 0.45);
  place(group, prop('phone_table', { size: 0.95 }), 1.08, 0, 2.4, -Math.PI / 2);
  solid(1.08, 2.4, 0.45, 0.6, 0, 0.9);
  const portrait = prop('portrait', { size: 1.15, axis: 'max', shadows: false });
  place(group, portrait, -7.86, 1.55, 3.5, Math.PI / 2);
  portrait.rotation.y = Math.PI / 2;
  const portrait2 = prop('portrait', { size: 0.9, axis: 'max', shadows: false });
  place(group, portrait2, -1.27, 1.25, -1.2, Math.PI / 2);

  // front door with chains
  const frontDoor = new THREE.Group();
  frontDoor.position.set(-DOORS.front.w / 2, 0, DOORS.front.z);
  const fd = prop('front_door', { size: 2.25 });
  const fdSize = fd.userData.size as THREE.Vector3 | undefined;
  if (fdSize) fd.scale.x = DOORS.front.w / Math.max(fdSize.x, 0.1);
  fd.position.set(DOORS.front.w / 2, 0, 0);
  frontDoor.add(fd);
  group.add(frontDoor);
  addCollider({ x0: -0.6, x1: 0.6, z0: 6.85, z1: 7.1, y0: 0, y1: 2.3, id: 'door-front' });
  const chains = new THREE.Group();
  const chainMat = new THREE.MeshStandardMaterial({ color: 0x55504a, metalness: 1, roughness: 0.45 });
  for (const tilt of [0.55, -0.55]) {
    for (let i = -7; i <= 7; i++) {
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 6, 12), chainMat);
      link.position.set(i * 0.06 * Math.cos(tilt), 1.15 + i * 0.06 * Math.sin(tilt), 6.86);
      link.rotation.set(0, i % 2 ? Math.PI / 2 : 0, tilt);
      link.castShadow = true;
      chains.add(link);
    }
  }
  const padlock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.04), new THREE.MeshStandardMaterial({ color: 0x8a6a2a, metalness: 1, roughness: 0.35 }));
  padlock.position.set(0, 1.08, 6.84);
  chains.add(padlock);
  group.add(chains);

  // --- parlor --------------------------------------------------------------------
  place(group, prop('fireplace', { size: 1.45 }), -7.62, 0, 3.0, Math.PI / 2);
  solid(-7.6, 3.0, 0.7, 1.9, 0, 1.5);
  const rug = plane(3.2, 2.4, 1, M.carpet);
  rug.position.set(-5.3, 0.006, 3.2);
  group.add(rug);
  place(group, prop('sofa', { size: 2.1, axis: 'max' }), -4.6, 0, 3.0, -Math.PI / 2);
  solid(-4.6, 3.0, 0.95, 2.1, 0, 0.9);
  place(group, prop('rocking_chair', { size: 1.1, tint: 0x8a6a4a }), -6.55, 0, 1.25, 0.65);
  solid(-6.55, 1.25, 0.75, 0.75, 0, 1);
  place(group, prop('crt_tv', { size: 1.05 }), -2.15, 0, 6.25, -2.3);
  solid(-2.15, 6.25, 0.75, 0.75, 0, 1.1);
  const radio = prop('tube_radio', { size: 1.0 });
  place(group, radio, -3.2, 0, 0.36, 0);
  solid(-3.2, 0.36, 0.95, 0.55, 0, 1.1);

  // TV screen: animated canvas (EAS broadcast / static)
  const tvCanvas = document.createElement('canvas');
  tvCanvas.width = 320; tvCanvas.height = 240;
  const tvTexture = new THREE.CanvasTexture(tvCanvas);
  tvTexture.colorSpace = THREE.SRGBColorSpace;
  const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.34), new THREE.MeshBasicMaterial({ map: tvTexture, toneMapped: false }));
  const tvRot = -2.3;
  const tvFwd = new THREE.Vector3(Math.sin(tvRot), 0, Math.cos(tvRot));
  const tvRight = new THREE.Vector3(Math.cos(tvRot), 0, -Math.sin(tvRot));
  tvScreen.position.set(-2.15, 0.66, 6.25).addScaledVector(tvFwd, 0.275).addScaledVector(tvRight, -0.06);
  tvScreen.rotation.y = tvRot;
  group.add(tvScreen);
  const tvLight = new THREE.PointLight(0x8fb4ff, 1.2, 6, 2);
  tvLight.position.copy(tvScreen.position).addScaledVector(tvFwd, 0.5);
  group.add(tvLight);

  const radioDial = new THREE.MeshStandardMaterial({ color: 0x110a04, emissive: 0xff8a2a, emissiveIntensity: 0 });
  const dial = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.06), radioDial);
  dial.position.set(-3.2, 0.66, 0.36 + 0.24);
  group.add(dial);

  // --- study ---------------------------------------------------------------------
  place(group, prop('desk', { size: 1.5, axis: 'x' }), -4.6, 0, -6.45, 0);
  solid(-4.6, -6.45, 1.55, 0.75, 0, 1.0);
  place(group, prop('safe', { size: 1.0 }), SAFE.x, 0, SAFE.z, SAFE.rot);
  solid(SAFE.x, SAFE.z, 0.85, 0.85, 0, 1.0);
  // The safe mesh is sealed; opening it shows a dark cavity over the door and a swung-open slab.
  const safeCavity = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.62), cavityMat);
  safeCavity.position.copy(SAFE_FRONT).setY(0.5);
  safeCavity.rotation.y = SAFE.rot;
  safeCavity.visible = false;
  group.add(safeCavity);
  const safeDoor = new THREE.Group();
  safeDoor.position.copy(SAFE_FRONT).addScaledVector(SAFE_RIGHT, 0.24).setY(0.19);
  safeDoor.rotation.y = SAFE.rot;
  const sd = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.64, 0.07), new THREE.MeshStandardMaterial({ color: 0x15161a, metalness: 0.7, roughness: 0.45 }));
  sd.position.set(-0.24, 0.32, 0.035);
  const sdDial = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 20), new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: 1, roughness: 0.3 }));
  sdDial.rotation.x = Math.PI / 2;
  sdDial.position.set(-0.24, 0.36, 0.08);
  safeDoor.add(sd, sdDial);
  safeDoor.visible = false;
  group.add(safeDoor);
  for (const z of [-5.4, -2.6]) {
    place(group, prop('bookshelf', { size: 2.2 }), -7.7, 0, z, Math.PI / 2);
    solid(-7.7, z, 0.5, 1.3, 0, 2.2);
  }
  place(group, prop('barrel', { size: 0.9 }), -7.4, 0, -0.6);

  // --- dining room ---------------------------------------------------------------
  place(group, prop('dining_table', { size: 2.1, axis: 'max' }), 4.7, 0, 3.6, 0);
  solid(4.7, 3.6, 2.1, 1.0, 0.55, 1.0);
  for (const [x, z, r] of [[4.1, 2.75, 0], [5.3, 2.75, 0], [4.1, 4.45, Math.PI], [5.3, 4.45, Math.PI], [3.25, 3.6, Math.PI / 2]] as const) {
    place(group, prop('dining_chair', { size: 1.0 }), x, 0, z, r);
    solid(x, z, 0.42, 0.42, 0, 0.95);
  }
  place(group, prop('bookshelf', { size: 1.9 }), 7.75, 0, 1.2, -Math.PI / 2);
  solid(7.75, 1.2, 0.5, 1.2, 0, 2);

  // --- kitchen -------------------------------------------------------------------
  // fridge, sink counter (under the window) and stove sit west along the north wall, leaving a
  // ~1 m walkway to the basement door at the east end
  // (the fridge mesh is ~1.37 m wide with its handle, so its centre stays >= 2.05 to keep it
  // out of the hall wall; the counter is sized to fit between fridge and stove)
  place(group, prop('fridge', { size: 1.65 }), 2.05, 0, -6.5, 0);
  solid(2.05, -6.5, 1.2, 0.95, 0, 1.7);
  place(group, prop('kitchen_counter', { size: 1.8, axis: 'x' }), 3.63, 0, -6.6, 0);
  solid(3.63, -6.6, 1.8, 0.7, 0, 1.0);
  place(group, prop('stove', { size: 0.95 }), 5.0, 0, -6.55, 0);
  solid(5.0, -6.55, 0.8, 0.75, 0, 1.0);
  place(group, prop('dining_table', { size: 1.4, axis: 'max' }), 3.6, 0, -3.4, Math.PI / 2);
  solid(3.6, -3.4, 0.75, 1.4, 0.5, 0.85);
  for (const [x, z, r] of [[2.85, -3.4, Math.PI / 2], [4.35, -3.0, -Math.PI / 2]] as const) {
    place(group, prop('dining_chair', { size: 1.0 }), x, 0, z, r);
    solid(x, z, 0.42, 0.42, 0, 0.95);
  }
  const fuseBox = prop('fuse_box', { size: 0.65, axis: 'max' });
  place(group, fuseBox, 6.22, 1.0, -3.6, -Math.PI / 2);
  // three sockets + the inserted fuses (hidden until installed)
  const fuseSlots: THREE.Mesh[] = [];
  const fuseMat = new THREE.MeshStandardMaterial({ color: 0xbfd8ff, emissive: 0x6a8cff, emissiveIntensity: 0.0, transparent: true, opacity: 0.85, roughness: 0.1 });
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.11, 10), fuseMat.clone());
    f.position.set(6.05, 1.25 + i * 0.1, -3.72);
    f.rotation.z = Math.PI / 2;
    f.visible = false;
    group.add(f);
    fuseSlots.push(f);
  }
  const lever = new THREE.Group();
  lever.position.set(6.1, 1.3, -3.3);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.04), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }));
  handle.position.y = 0.11;
  lever.add(handle);
  lever.rotation.x = 0.7;
  group.add(lever);

  // basement door
  const basementDoor = new THREE.Group();
  basementDoor.position.set(DOORS.basement.x - 0.04, 0, -6.7);
  const bd = prop('front_door', { size: 2.12, tint: 0x9a8a7a });
  const bdSize = bd.userData.size as THREE.Vector3 | undefined;
  if (bdSize) bd.scale.x = 1.0 / Math.max(bdSize.x, 0.1);
  bd.rotation.y = Math.PI / 2;
  bd.position.set(0, 0, 0.5);
  basementDoor.add(bd);
  group.add(basementDoor);
  addCollider({ x0: 6.3, x1: 6.5, z0: -6.7, z1: -5.7, y0: 0, y1: 2.2, id: 'door-basement' });

  // --- basement ------------------------------------------------------------------
  const BY = BASEMENT_Y;
  place(group, prop('altar', { size: 1.9, axis: 'x' }), -7.05, BY, -3.5, Math.PI / 2);
  solid(-7.05, -3.5, 0.75, 1.95, BY, BY + 1.0);
  place(group, prop('transmitter', { size: 2.05 }), -5.0, BY, -6.55, 0);
  solid(-5.0, -6.55, 1.0, 0.7, BY, BY + 2.1);
  place(group, prop('furnace', { size: 2.0 }), 0.2, BY, -5.9, 0);
  solid(0.2, -5.9, 1.4, 1.4, BY, BY + 2);
  for (const x of [0.6, 2.7]) {
    place(group, prop('basement_shelf', { size: 1.9 }), x, BY, -0.4, Math.PI);
    solid(x, -0.4, 1.3, 0.5, BY, BY + 1.9);
  }
  for (const [x, z] of [[4.9, -6.45], [5.6, -6.0], [-7.3, -0.6]] as const) {
    place(group, prop('barrel', { size: 0.95 }), x, BY, z, Math.random() * 6);
    solid(x, z, 0.62, 0.62, BY, BY + 1);
  }
  for (const x of [-2.2, 2.2]) {
    box(group, 0.26, -BASEMENT_CEIL + BY + 6, 0.26, x, (BY + BASEMENT_CEIL) / 2, -3.5, M.trim);
    solid(x, -3.5, 0.3, 0.3, BY, BASEMENT_CEIL);
  }
  // pipes running along the ceiling to the valves
  const pipeMat = M.rust;
  const pipe = (x0: number, z0: number, x1: number, z1: number, y: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 10), pipeMat);
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    m.rotation.z = Math.PI / 2;
    m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    group.add(m);
  };
  pipe(-7.5, -6.75, 6.2, -6.75, BASEMENT_CEIL - 0.35);
  pipe(-7.5, -0.25, 6.2, -0.25, BASEMENT_CEIL - 0.35);

  const valveWheels = {} as Record<'a' | 'b', THREE.Object3D>;
  for (const [k, p, r] of [['a', SPOTS.valveA, 0], ['b', SPOTS.valveB, Math.PI]] as const) {
    const v = prop('valve', { size: 0.75, axis: 'max' });
    place(group, v, p.x, BY + 0.85, p.z, r);
    valveWheels[k] = v;
  }

  // altar slots for the keepsakes, candles, the transmitter glow
  const altarSlots = {
    musicbox: new THREE.Vector3(-6.85, BY + 0.78, -4.05),
    doll: new THREE.Vector3(-6.85, BY + 0.78, -3.5),
    watch: new THREE.Vector3(-6.85, BY + 0.78, -2.95),
  };
  const candleLight = new THREE.PointLight(0xff7a30, 2.6, 7, 2);
  candleLight.position.set(-6.4, BY + 1.3, -4.4);
  group.add(candleLight);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffc070, toneMapped: false });
  const candleFlames: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.045, 6), flameMat);
    f.position.set(-7.0 + Math.random() * 0.25, BY + 1.02, -4.3 + i * 0.27);
    group.add(f);
    candleFlames.push(f);
  }
  const transmitterGlow = new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff5a10, emissiveIntensity: 1.2 });
  const tubes = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.02), transmitterGlow);
  tubes.position.set(-5.0, BY + 1.5, -6.18);
  group.add(tubes);

  // --- pickups -------------------------------------------------------------------
  const pickups: Record<string, THREE.Object3D> = {};
  const fuseProp = () => {
    const f = prop('fuse', { size: 0.13, axis: 'max', shadows: false });
    // a faint glow so the fuses read in a flashlight beam
    f.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m?.emissive) { m.emissive.setHex(0x4a6aa0); m.emissiveIntensity = 0.6; }
    });
    return f;
  };
  pickups.f1 = place(group, fuseProp(), SPOTS.fuse1.x, SPOTS.fuse1.y - 0.04, SPOTS.fuse1.z, 0.4);
  pickups.f2 = place(group, fuseProp(), SPOTS.fuse2.x, SPOTS.fuse2.y - 0.04, SPOTS.fuse2.z, 1.3);
  pickups.f3 = place(group, fuseProp(), SPOTS.fuse3.x, SPOTS.fuse3.y, SPOTS.fuse3.z, 2.2);
  pickups.doll = place(group, prop('doll', { size: 0.5, shadows: true }), SPOTS.doll.x, SPOTS.doll.y - 0.06, SPOTS.doll.z, 0.65);
  const shelf = box(group, 0.44, 0.02, 0.12, 0, 0, 0, cavityMat, 1, false);
  shelf.position.copy(SAFE_FRONT).addScaledVector(SAFE_FWD, 0.05).setY(0.5);
  shelf.rotation.y = SAFE.rot;
  pickups.key = place(group, prop('skeleton_key', { size: 0.14, axis: 'max', shadows: false }), SPOTS.key.x, 0.51, SPOTS.key.z, SAFE.rot + 0.3);
  pickups.musicbox = place(group, prop('music_box', { size: 0.22, axis: 'max' }), SPOTS.musicbox.x, 0.2, SPOTS.musicbox.z, SAFE.rot);
  pickups.watch = place(group, prop('pocket_watch', { size: 0.13, axis: 'max', shadows: false }), SPOTS.watch.x, SPOTS.watch.y - 0.06, SPOTS.watch.z, Math.PI / 2);
  pickups.watch.rotation.z = Math.PI / 2;
  const journal = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.2), new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 0.8 }));
  journal.position.copy(SPOTS.journal).setY(0.2);
  journal.rotation.y = SAFE.rot;
  group.add(journal);
  // safe and clock contents appear when they open
  for (const o of [pickups.key, pickups.musicbox, pickups.watch, journal, shelf]) o.visible = false;
  shelf.name = 'safe-shelf';

  const altarItems: Record<string, THREE.Object3D> = {
    doll: place(group, prop('doll', { size: 0.42 }), altarSlots.doll.x, altarSlots.doll.y, altarSlots.doll.z, Math.PI / 2),
    musicbox: place(group, prop('music_box', { size: 0.24, axis: 'max' }), altarSlots.musicbox.x, altarSlots.musicbox.y, altarSlots.musicbox.z, Math.PI / 2),
    watch: place(group, prop('pocket_watch', { size: 0.13, axis: 'max' }), altarSlots.watch.x, altarSlots.watch.y, altarSlots.watch.z, Math.PI / 2),
  };
  for (const o of Object.values(altarItems)) o.visible = false;

  // documents: paper sheets
  const paperMat = new THREE.MeshStandardMaterial({ color: 0xd8cfb4, roughness: 0.95, emissive: 0x2a2416, emissiveIntensity: 0.4 });
  for (const k of ['newspaper', 'sermon', 'ruth', 'log'] as const) {
    const p = SPOTS[k];
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(k === 'newspaper' ? 0.32 : 0.21, k === 'newspaper' ? 0.42 : 0.28), paperMat);
    sheet.rotation.x = -Math.PI / 2;
    sheet.rotation.z = Math.random() * 0.6 - 0.3;
    sheet.position.set(p.x, p.y - 0.06, p.z);
    if (k === 'log') { sheet.rotation.set(0, 0, 0.05); sheet.position.set(p.x + 0.3, p.y, p.z + 0.37); }
    group.add(sheet);
  }

  // police lights for the ending
  const police = new THREE.PointLight(0xff2020, 0, 30, 1.2);
  police.position.set(0, 1.6, 15);
  group.add(police);

  scene.fog = new THREE.FogExp2(0x030405, 0.07);
  scene.background = new THREE.Color(0x030405);

  // static props never move: skip per-frame matrix updates
  group.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
  for (const dyn of [frontDoor, basementDoor, clockDoor, safeDoor, lever, chains, ...Object.values(valveWheels), ...Object.values(pickups), ...Object.values(altarItems), ...candleFlames]) {
    dyn.traverse((o) => { o.matrixAutoUpdate = true; });
  }

  return {
    group, lamps, tvScreen, tvCanvas, tvTexture, tvLight, radioDial,
    frontDoor, chains, basementDoor, clockDoor, clockCavity, safeDoor, safeCavity, journal, fuseSlots, lever, valveWheels,
    pickups, altarSlots, altarItems, candleLight, candleFlames, transmitterGlow,
    outside, lightning, police, phone: new THREE.Vector3(1.08, 0.9, 2.4),
  };
}
