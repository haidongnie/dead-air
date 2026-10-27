import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Classic WebGLRenderer + EffectComposer: the VHS look is a custom GLSL pass and
// this path runs on every browser friends are likely to open the link in.

const VHSShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    danger: { value: 0 }, // 0..1, creature proximity
    glitch: { value: 0 }, // 0..1, short spikes (reveals, power surges)
    hurt: { value: 0 }, // 0..1, downed state
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, danger, glitch, hurt;
    uniform vec2 resolution;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float noise1(float x) { return fract(sin(x * 91.17) * 4375.85); }

    void main() {
      vec2 uv = vUv;
      float jitterAmt = 0.0006 + danger * 0.004 + glitch * 0.03;
      // horizontal tracking wobble per scanline band
      float band = floor(uv.y * 48.0 + time * 3.0);
      float wob = (noise1(band + floor(time * 18.0)) - 0.5) * jitterAmt;
      // occasional tracking tear near the bottom
      float tear = smoothstep(0.06, 0.0, abs(uv.y - fract(time * 0.07) * 1.3 + 0.15)) * 0.006;
      uv.x += wob + tear * (1.0 + danger * 4.0);
      if (glitch > 0.01) {
        float g = step(0.85, noise1(floor(uv.y * 20.0) + floor(time * 30.0)));
        uv.x += g * glitch * 0.05 * (noise1(time) - 0.5);
      }

      float ca = 0.0012 + danger * 0.004 + glitch * 0.012;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + vec2(ca, 0.0)).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - vec2(ca, 0.0)).b;

      // tape color: slightly crushed, cold shadows, warm highlights
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, 0.82 - danger * 0.25);
      col *= vec3(0.96, 1.0, 1.04);
      col = mix(col, col * vec3(1.08, 1.0, 0.9), smoothstep(0.3, 0.9, l));

      // scanlines + grain
      float scan = 0.94 + 0.06 * sin(vUv.y * resolution.y * 1.5);
      col *= scan;
      float grain = hash(vUv * resolution + fract(time * 61.0) * 100.0) - 0.5;
      col += grain * (0.055 + danger * 0.08 + glitch * 0.2);
      // static snow bursts when the creature is close
      float snow = step(1.0 - danger * 0.06 - glitch * 0.25, hash(vUv * 400.0 + time));
      col = mix(col, vec3(hash(vUv + time)), snow * 0.6);

      // downed: red, desaturated, pulsing
      if (hurt > 0.0) {
        float pulse = 0.5 + 0.5 * sin(time * 5.0);
        col = mix(col, vec3(l * 0.9, l * 0.1, l * 0.1) + vec3(0.12, 0.0, 0.0) * pulse, hurt * 0.75);
      }

      // vignette
      vec2 d = vUv - 0.5;
      float vig = smoothstep(0.85, 0.25 - danger * 0.1, length(d * vec2(1.1, 1.0)));
      col *= mix(0.35, 1.0, vig);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

const NaNGuardShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = min(c, vec4(64.0));
    }
  `,
};

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  readonly vhs: ShaderPass;
  readonly bloom: UnrealBloomPass;
  private pixelRatio: number;

  constructor(canvas: HTMLCanvasElement, readonly scene: THREE.Scene, readonly camera: THREE.PerspectiveCamera) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    r.toneMapping = THREE.AgXToneMapping;
    r.toneMappingExposure = 1.15;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = r;
    // weaker GPUs get a lower internal resolution; the VHS look hides it well
    const mobile = matchMedia('(pointer: coarse)').matches;
    this.pixelRatio = Math.min(devicePixelRatio, mobile ? 1 : 1.5);
    r.setPixelRatio(this.pixelRatio);
    r.setSize(innerWidth, innerHeight);

    const target = new THREE.WebGLRenderTarget(innerWidth, innerHeight, {
      type: THREE.HalfFloatType,
      samples: mobile ? 0 : 4,
    });
    this.composer = new EffectComposer(r, target);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.addPass(new RenderPass(scene, camera));
    // Guard: a single NaN pixel would otherwise spread through the bloom blur to the whole frame.
    this.composer.addPass(new ShaderPass(NaNGuardShader));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.6, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.vhs = new ShaderPass(VHSShader);
    this.composer.addPass(this.vhs);

    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.vhs.uniforms.resolution.value.set(w * this.pixelRatio, h * this.pixelRatio);
  }

  render(time: number) {
    this.vhs.uniforms.time.value = time;
    this.composer.render();
  }
}
