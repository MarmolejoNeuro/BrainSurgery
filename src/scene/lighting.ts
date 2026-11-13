import * as THREE from 'three';
import { SIM } from '../config/sim';

/**
 * Microscope illumination: a near-coaxial warm spot light mounted beside the
 * objective, so it always lights what you look at with very short shadows.
 * A faint hemisphere light keeps the deep corners from going pure black.
 */
export class MicroscopeLight {
  readonly spot: THREE.SpotLight;
  readonly fill: THREE.HemisphereLight;

  constructor(scene: THREE.Scene) {
    this.spot = new THREE.SpotLight(SIM.render.lightColor, SIM.render.lightIntensity, 0, 0.16, 0.75, 0);
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(2048, 2048);
    this.spot.shadow.camera.near = 150;
    this.spot.shadow.camera.far = 400;
    this.spot.shadow.bias = -0.0004;
    this.spot.shadow.normalBias = 0.02;
    this.spot.shadow.radius = 4;
    scene.add(this.spot, this.spot.target);

    this.fill = new THREE.HemisphereLight('#ffe6d0', '#200a08', 0.12);
    scene.add(this.fill);
  }

  /** Keep the light on the objective, slightly offset from the optical axis. */
  follow(camera: THREE.Camera, focal: THREE.Vector3): void {
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    this.spot.position.copy(camera.position).addScaledVector(right, 14).addScaledVector(up, 10);
    this.spot.target.position.copy(focal);
    this.spot.target.updateMatrixWorld();
  }
}
