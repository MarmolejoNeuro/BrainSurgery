import * as THREE from 'three';
import type { Anatomy } from '../anatomy';
import { addPulsation } from '../anatomy/materials';
import { pulseUniform } from '../anatomy/materials';
import { state } from '../core/store';

/**
 * Dome material for ICG: the part of the sac BELOW the clip line (a residual
 * neck) communicates with the parent artery and fills like it; the part above
 * fills only if the clip leaves the neck open. Local y of the dome geometry runs
 * along the aneurysm axis from the neck plane (y = 0).
 */
function domeIcgMaterial(uniforms: { uNeckGlow: { value: THREE.Color }; uDomeGlow: { value: THREE.Color }; uRemH: { value: number } }): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color: '#181818' });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { uPulse: pulseUniform, uPulseAmp: { value: 0.1 } });
    shader.vertexShader =
      `uniform float uPulse;\nuniform float uPulseAmp;\nvarying float vLocalY;\n` +
      shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>\nvLocalY = position.y;\ntransformed += objectNormal * uPulse * uPulseAmp;`);
    shader.fragmentShader =
      `uniform vec3 uNeckGlow;\nuniform vec3 uDomeGlow;\nuniform float uRemH;\nvarying float vLocalY;\n` +
      shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `totalEmissiveRadiance = mix(uNeckGlow, uDomeGlow, step(uRemH, vLocalY));\n#include <emissivemap_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'icg-dome';
  return m;
}

/**
 * Indocyanine green (ICG) videoangiography.
 *
 * ICG is injected IV and fluoresces in near-infrared light; the microscope shows
 * it as a bright signal inside perfused vessels. Arteries light up first
 * (arterial phase), then capillaries (parenchymal blush), then veins. A
 * correctly clipped aneurysm stays DARK while the PCom and AChA still fill.
 *
 * Here each vessel fills after a delay that follows the flow path, scaled by
 * its relative flow in the shared state.
 */
const DELAY: Record<string, number> = {
  ica: 0.0, pcom: 0.45, acha: 0.5, dome: 0.55, a1: 0.5, m1: 0.45, m2sup: 0.8, m2inf: 0.85,
};
const FILL_TIME = 0.6;

interface Swap {
  mesh: THREE.Mesh;
  original: THREE.Material | THREE.Material[];
}

export class IcgView {
  on = false;
  private t = 0;
  private swaps: Swap[] = [];
  private vesselMats = new Map<string, THREE.MeshLambertMaterial>();
  private dark = new THREE.MeshLambertMaterial({ color: '#141414' });
  private veinMat = new THREE.MeshLambertMaterial({ color: '#202020', emissive: new THREE.Color(0, 0, 0) });
  private brainMat = addPulsation(new THREE.MeshLambertMaterial({ color: '#1c1c1c', emissive: new THREE.Color(0, 0, 0) }), 0.05);

  private domeU = { uNeckGlow: { value: new THREE.Color(0, 0, 0) }, uDomeGlow: { value: new THREE.Color(0, 0, 0) }, uRemH: { value: 0 } };
  private domeMat = domeIcgMaterial(this.domeU);

  /**
   * @param remnantHeight height (mm above the neck plane) below which the sac
   *   still fills from the parent artery (0 when no clip or a perfect clip).
   */
  constructor(private anatomy: Anatomy, private hidden: THREE.Object3D[], private remnantHeight: () => number = () => 0) {}

  toggle(): boolean {
    this.on ? this.disable() : this.enable();
    return this.on;
  }

  private matFor(id: string, amp: number): THREE.MeshLambertMaterial {
    let m = this.vesselMats.get(id);
    if (!m) {
      m = addPulsation(new THREE.MeshLambertMaterial({ color: '#181818', emissive: new THREE.Color(0, 0, 0) }), amp);
      this.vesselMats.set(id, m);
    }
    return m;
  }

  private enable(): void {
    this.on = true;
    this.t = 0;
    this.anatomy.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const { kind, id } = mesh.userData;
      let mat: THREE.Material;
      if (kind === 'vessel') mat = this.matFor(id, 0.05);
      else if (kind === 'dome') mat = this.domeMat;
      else if (kind === 'bleb') mat = this.matFor('dome', 0.1);
      else if (kind === 'vein') mat = this.veinMat;
      else if (kind === 'brain') mat = this.brainMat;
      else mat = this.dark;
      this.swaps.push({ mesh, original: mesh.material });
      mesh.material = mat;
    });
    for (const h of this.hidden) h.visible = false;
  }

  private disable(): void {
    this.on = false;
    for (const s of this.swaps) s.mesh.material = s.original;
    this.swaps = [];
    for (const h of this.hidden) h.visible = true;
  }

  update(dt: number): void {
    if (!this.on) return;
    this.t += dt;
    const fill = (delay: number) => THREE.MathUtils.smoothstep(this.t, delay, delay + FILL_TIME);
    for (const [id, m] of this.vesselMats) {
      const f = fill(DELAY[id] ?? 0.6) * (state.flow[id] ?? 1);
      // Near-infrared display: grayscale, with a slight green cast.
      m.emissive.setRGB(0.6 * f, 0.72 * f, 0.6 * f);
    }
    // Dome: residual neck fills with the parent; the sac fills with the dome inflow.
    const parent = fill(DELAY.ica + 0.1) * (state.flow.ica ?? 1);
    const sac = fill(DELAY.dome) * (state.flow.dome ?? 1);
    this.domeU.uNeckGlow.value.setRGB(0.6 * Math.max(parent, sac), 0.72 * Math.max(parent, sac), 0.6 * Math.max(parent, sac));
    this.domeU.uDomeGlow.value.setRGB(0.6 * sac, 0.72 * sac, 0.6 * sac);
    this.domeU.uRemH.value = this.remnantHeight();
    // Capillary blush, then venous phase.
    const blush = fill(1.6) * 0.035;
    this.brainMat.emissive.setRGB(blush, blush * 1.15, blush);
    const venous = fill(3.2) * 0.35;
    this.veinMat.emissive.setRGB(venous, venous * 1.15, venous);
  }
}
