import * as THREE from 'three';
import { ANATOMY } from '../config/anatomy';
import { steelMaterial } from './materials';

/**
 * Brain spatula (self-retaining retractor blade). Gentle retraction of the
 * frontal and temporal opercula widens the opened fissure. Built in the lobe's
 * local frame, where the fissure face is z = 0; side = direction the lobe extends
 * (-1 frontal, +1 temporal).
 */
export function buildSpatula(side: 1 | -1, cfg: { x: number; tipY: number; tilt: number }): THREE.Group {
  const { width, length, thickness } = ANATOMY.spatulas;
  const g = new THREE.Group();
  const mat = steelMaterial();

  // Blade: thin plate whose bottom edge is the tip; slight rounding at the tip.
  const shape = new THREE.Shape();
  const hw = width / 2, rr = 1.2;
  shape.moveTo(-hw + rr, 0);
  shape.lineTo(hw - rr, 0);
  shape.quadraticCurveTo(hw, 0, hw, rr);
  shape.lineTo(hw * 0.8, length);
  shape.lineTo(-hw * 0.8, length);
  shape.lineTo(-hw, rr);
  shape.quadraticCurveTo(-hw, 0, -hw + rr, 0);
  const blade = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.08, bevelSegments: 2 }),
    mat,
  );
  blade.position.z = -thickness / 2;
  blade.castShadow = true;
  blade.userData = { kind: 'spatula', id: side < 0 ? 'spatulaF' : 'spatulaT', labelKey: 'label.spatula' };

  // Flexible arm: bends away from the corridor at the top of the blade so it
  // does not cross the microscope view.
  const elbow = new THREE.Group();
  elbow.position.set(0, length, 0);
  elbow.rotation.x = side * 0.75;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 50, 12), mat);
  arm.position.set(0, 25, 0);
  arm.castShadow = true;
  arm.userData = blade.userData;
  elbow.add(arm);

  const pivot = new THREE.Group();
  pivot.add(blade, elbow);
  // Lean the blade over the lobe so it follows the opercular surface.
  pivot.rotation.x = side * cfg.tilt;
  pivot.position.set(cfg.x, cfg.tipY, -side * (thickness / 2 + 0.15));
  g.add(pivot);
  return g;
}
