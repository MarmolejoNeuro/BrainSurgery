import * as THREE from 'three';
import {
  BloomEffect,
  BlendFunction,
  ChromaticAberrationEffect,
  DepthOfFieldEffect,
  Effect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  OutlineEffect,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { SIM } from '../config/sim';

/**
 * Circular field stop of the microscope eyepiece plus a warm color grade
 * (halogen/xenon light through optics tends toward warm, slightly saturated reds).
 */
const microscopeFrag = /* glsl */ `
uniform float uAspect;
uniform float uRadius;
uniform float uSoftness;
uniform vec3 uTint;
uniform float uSaturation;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 p = uv - 0.5;
  p.x *= uAspect;
  float d = length(p);
  float mask = 1.0 - smoothstep(uRadius - uSoftness, uRadius, d);
  vec3 c = inputColor.rgb * uTint;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  // faint dark ring just inside the stop, like the edge of the eyepiece tube
  float ring = smoothstep(uRadius - uSoftness * 2.5, uRadius - uSoftness, d) * 0.25;
  outputColor = vec4(c * mask * (1.0 - ring), inputColor.a);
}
`;

class MicroscopeEffect extends Effect {
  constructor() {
    super('MicroscopeEffect', microscopeFrag, {
      uniforms: new Map<string, THREE.Uniform>([
        ['uAspect', new THREE.Uniform(1)],
        ['uRadius', new THREE.Uniform(0.47)],
        ['uSoftness', new THREE.Uniform(0.035)],
        ['uTint', new THREE.Uniform(new THREE.Vector3(1.06, 0.97, 0.86))],
        ['uSaturation', new THREE.Uniform(1.12)],
      ]),
    });
  }
  setAspect(a: number): void {
    this.uniforms.get('uAspect')!.value = a;
  }
}

export class MicroscopePost {
  readonly composer: EffectComposer;
  readonly dof: DepthOfFieldEffect;
  readonly bloom: BloomEffect;
  /** Hover highlight around the instrument's target. */
  readonly outline: OutlineEffect;
  private dofPass: EffectPass;
  private scope: MicroscopeEffect;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: Math.min(4, renderer.capabilities.maxSamples),
    });
    this.composer.addPass(new RenderPass(scene, camera));

    this.dof = new DepthOfFieldEffect(camera, {
      focusDistance: SIM.microscope.workingDistance,
      focusRange: 8,
      bokehScale: SIM.render.bokehScale,
      resolutionScale: 0.5,
    });
    this.dofPass = new EffectPass(camera, this.dof);
    this.dofPass.enabled = SIM.render.dof;
    this.composer.addPass(this.dofPass);

    this.bloom = new BloomEffect({
      intensity: SIM.render.bloom,
      luminanceThreshold: 0.72,
      luminanceSmoothing: 0.2,
      mipmapBlur: true,
      radius: 0.7,
    });
    const ca = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(0.0006, 0.0004),
      radialModulation: true,
      modulationOffset: 0.35,
    });
    this.composer.addPass(new EffectPass(camera, ca));

    const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.62 });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    const noise = new NoiseEffect({ blendFunction: BlendFunction.SOFT_LIGHT, premultiply: true });
    noise.blendMode.opacity.value = 0.18;
    this.scope = new MicroscopeEffect();
    this.outline = new OutlineEffect(scene, camera, {
      blendFunction: BlendFunction.SCREEN,
      edgeStrength: 3,
      visibleEdgeColor: 0x5fd3c6,
      hiddenEdgeColor: 0x1a3a38,
      xRay: true,
      resolutionScale: 0.75,
    });
    this.composer.addPass(new EffectPass(camera, this.bloom, tone, this.outline, vignette, noise, this.scope));
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h, false);
    this.scope.setAspect(w / h);
  }

  private dofWanted = SIM.render.dof;
  private bloomWanted = SIM.render.bloom;
  private icg = false;

  setDof(on: boolean): void {
    this.dofWanted = on;
    this.dofPass.enabled = on && !this.icg;
  }

  /**
   * ICG video comes from the microscope's near-infrared camera, not the
   * eyepieces: no optical depth of field and little glow.
   */
  setIcgMode(on: boolean): void {
    if (on && !this.icg) this.bloomWanted = this.bloom.intensity;
    this.icg = on;
    this.dofPass.enabled = this.dofWanted && !on;
    this.bloom.intensity = on ? 0.08 : this.bloomWanted;
  }

  /** Keep the focal point sharp; range shrinks with magnification, like real optics. */
  setFocus(target: THREE.Vector3, mag: number): void {
    this.dof.target = target;
    this.dof.cocMaterial.focusRange = SIM.render.dofRangeAt1x / mag;
  }

  /** Outline objects; color by how the tool would affect them. */
  setHighlight(objects: THREE.Object3D[], cls: 'ok' | 'warn' | 'harm' | null): void {
    const sel = this.outline.selection;
    const same = objects.length === sel.size && objects.every((o) => sel.has(o));
    if (!same) {
      sel.clear();
      for (const o of objects) o.traverse((c) => { if ((c as THREE.Mesh).isMesh) sel.add(c); });
    }
    const color = cls === 'harm' ? 0xff4d4d : cls === 'warn' ? 0xf2c14e : 0x5fd3c6;
    this.outline.visibleEdgeColor.setHex(color);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }
}
