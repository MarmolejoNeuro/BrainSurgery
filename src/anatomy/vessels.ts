import * as THREE from 'three';
import { ANATOMY, type VesselDef } from '../config/anatomy';
import { arteryMaterial } from './materials';
import { buildTube, v3 } from './tube';

export interface Vessel {
  id: string;
  def: VesselDef;
  curve: THREE.CatmullRomCurve3;
  radiusAt: (t: number) => number;
  mesh: THREE.Mesh;
}

/**
 * Build all arteries from the config. Order matters: a vessel whose origin
 * refers to a parent must come after that parent (ICA → M1/A1 → M2, PCom, AChA).
 */
export function buildVessels(): Map<string, Vessel> {
  const out = new Map<string, Vessel>();
  const defs = ANATOMY.vessels as Record<string, VesselDef>;
  const order = ['ica', 'm1', 'a1', 'm2sup', 'm2inf', 'pcom', 'acha'];
  const ids = [...order.filter((k) => k in defs), ...Object.keys(defs).filter((k) => !order.includes(k))];

  for (const id of ids) {
    const def = defs[id];
    const pts = def.points.map(v3);
    if (def.origin) {
      const parent = out.get(def.origin.parent);
      if (!parent) throw new Error(`Vessel ${id}: parent ${def.origin.parent} not built yet`);
      const o = parent.curve.getPointAt(def.origin.t);
      if (def.origin.side) {
        // Start just inside the parent's wall on the requested side.
        o.addScaledVector(v3(def.origin.side).normalize(), parent.radiusAt(def.origin.t) * 0.45);
      }
      pts.unshift(o);
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const [r0, r1] = def.radius;
    const radiusAt = (t: number) => r0 + (r1 - r0) * t;
    const geo = buildTube(curve, { radius: radiusAt });
    const mat = arteryMaterial(def.color, def.pulse);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { kind: 'vessel', id, labelKey: `label.${id}` };

    // Rounded caps at both ends hide open tube rings at bifurcations and stumps.
    for (const [t, r] of [[0, r0], [1, r1]] as const) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat);
      cap.position.copy(curve.getPointAt(t));
      cap.castShadow = true;
      cap.userData = mesh.userData;
      mesh.add(cap);
    }
    out.set(id, { id, def, curve, radiusAt, mesh });
  }
  return out;
}
