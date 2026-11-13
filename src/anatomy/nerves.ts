import * as THREE from 'three';
import { ANATOMY } from '../config/anatomy';
import { nerveMaterial } from './materials';
import { buildTube, v3 } from './tube';

/** Optic nerve (CN II) and oculomotor nerve (CN III). */
export function buildNerves(): Map<string, THREE.Mesh> {
  const out = new Map<string, THREE.Mesh>();
  for (const [id, cfg] of Object.entries(ANATOMY.nerves)) {
    const curve = new THREE.CatmullRomCurve3(cfg.points.map(v3), false, 'centripetal');
    const geo = buildTube(curve, { radius: () => cfg.radius, flatten: cfg.flatten, radialSegments: 28 });
    const mat = nerveMaterial(cfg.color);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { kind: 'nerve', id, labelKey: `label.${id}` };
    for (const t of [0, 1]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(cfg.radius, 20, 14), mat);
      cap.scale.y = cfg.flatten;
      cap.position.copy(curve.getPointAt(t));
      cap.userData = mesh.userData;
      mesh.add(cap);
    }
    out.set(id, mesh);
  }
  return out;
}
