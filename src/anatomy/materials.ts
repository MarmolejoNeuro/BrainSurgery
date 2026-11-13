import * as THREE from 'three';
import { makeArachnoidTexture, makeNerveTexture, makePialTexture, makeVesselTexture } from './textures';

/**
 * Shared pulse uniform (0..1 arterial waveform), driven by the heart model.
 * Every pulsating material reads it in its vertex shader.
 */
export const pulseUniform = { value: 0 };

/**
 * Inject radial pulsation into a standard/physical material: vertices move
 * along their normal by `amp * pulse` (mm). Tubes have radial normals, so the
 * vessel visibly swells in systole.
 */
export function addPulsation<T extends THREE.Material>(mat: T, amp: number): T {
  const ampUniform = { value: amp };
  mat.userData.pulseAmp = ampUniform;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPulse = pulseUniform;
    shader.uniforms.uPulseAmp = ampUniform;
    shader.vertexShader =
      'uniform float uPulse;\nuniform float uPulseAmp;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed += objectNormal * uPulse * uPulseAmp;',
      );
  };
  mat.customProgramCacheKey = () => 'pulse';
  return mat;
}

// Lazily created shared textures
let pial: THREE.Texture | null = null;
let arach: THREE.Texture | null = null;
let nerveTex: THREE.Texture | null = null;
let vesselTex: THREE.Texture | null = null;

/** Brain surface: moist pia with a clearcoat film of CSF. */
export function brainMaterial(amp: number): THREE.MeshPhysicalMaterial {
  pial ??= makePialTexture();
  return addPulsation(
    new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      map: pial,
      roughness: 0.55,
      clearcoat: 0.9,
      clearcoatRoughness: 0.24,
      sheen: 0.35,
      sheenColor: new THREE.Color('#ffd0c4'),
      sheenRoughness: 0.5,
    }),
    amp,
  );
}

export function arteryMaterial(color: string, amp: number): THREE.MeshPhysicalMaterial {
  vesselTex ??= makeVesselTexture();
  return addPulsation(
    new THREE.MeshPhysicalMaterial({
      color,
      map: vesselTex,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      sheen: 0.25,
      sheenColor: new THREE.Color('#ff9a8a'),
    }),
    amp,
  );
}

export function veinMaterial(color: string): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.28,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  });
}

/** Aneurysm wall: vertex-colored (thicker red base, thinner paler dome, dark bleb). */
export function aneurysmMaterial(amp: number): THREE.MeshPhysicalMaterial {
  return addPulsation(
    new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.26,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      sheen: 0.4,
      sheenColor: new THREE.Color('#ffb0a0'),
    }),
    amp,
  );
}

export function nerveMaterial(color: string): THREE.MeshPhysicalMaterial {
  nerveTex ??= makeNerveTexture();
  return new THREE.MeshPhysicalMaterial({
    color,
    map: nerveTex,
    roughness: 0.48,
    clearcoat: 0.7,
    clearcoatRoughness: 0.2,
  });
}

export function arachnoidMaterial(color: string, opacity: number): THREE.MeshPhysicalMaterial {
  arach ??= makeArachnoidTexture();
  return new THREE.MeshPhysicalMaterial({
    color,
    alphaMap: arach,
    transparent: true,
    opacity,
    roughness: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

export function duraMaterial(color: string): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    vertexColors: true,
    roughness: 0.6,
    clearcoat: 0.6,
    clearcoatRoughness: 0.3,
  });
}

export function steelMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: '#d4d7da', metalness: 0.85, roughness: 0.32, envMapIntensity: 4 });
}
