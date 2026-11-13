import * as THREE from 'three';
import { ANATOMY } from '../config/anatomy';
import { mulberry32 } from './noise';
import type { Aneurysm } from './aneurysm';
import type { Vessel } from './vessels';

/**
 * Arachnoid adhesions tethering the aneurysm neck to its surroundings.
 *
 * Before a clip can be applied safely, the neck must be freed on BOTH sides so
 * the blades can pass completely across it without catching the PCom, the
 * anterior choroidal artery or perforators. The dissector frees these bands
 * with gentle strokes; neck clearance = fraction of bands released.
 */
export interface Adhesion {
  mesh: THREE.Mesh;
  a: THREE.Vector3;
  b: THREE.Vector3;
  strength: number;
  broken: boolean;
  fade: number;
}

export class Adhesions {
  readonly group = new THREE.Group();
  readonly list: Adhesion[] = [];

  constructor(an: Aneurysm, ica: Vessel) {
    const cfg = ANATOMY.adhesions;
    const rnd = mulberry32(31);
    // Frame around the aneurysm axis: u points toward the microscope (+Y) side.
    // Bands are spread over the visible ~240° so they can be reached through
    // the transsylvian corridor; the far side is what the endoscope checks.
    const axis = an.axis;
    const u = new THREE.Vector3(0, 1, 0).addScaledVector(axis, -axis.y).normalize();
    const w = new THREE.Vector3().crossVectors(axis, u).normalize();
    const spread = (cfg.arcDegrees * Math.PI) / 180;

    // A band must lie in open space: outside the ICA and outside the dome.
    const icaDist = (q: THREE.Vector3) => {
      let best = Infinity;
      const c = new THREE.Vector3();
      for (let k = 0; k <= 40; k++) {
        ica.curve.getPointAt(k / 40, c);
        best = Math.min(best, q.distanceTo(c) - ica.radiusAt(k / 40));
      }
      return best;
    };
    const free = (q: THREE.Vector3) => icaDist(q) > 0.35 && q.distanceTo(an.domeCenter) > an.domeRadius + 0.3;

    for (let i = 0; i < cfg.count; i++) {
      const ang0 = -spread / 2 + (spread * (i + 0.5)) / cfg.count;
      let a = new THREE.Vector3(), b = new THREE.Vector3(), mid = new THREE.Vector3();
      for (let attempt = 0; attempt < 40; attempt++) {
        const ang = ang0 + (rnd() - 0.5) * 0.5 * (1 + attempt / 10);
        const radial = u.clone().multiplyScalar(Math.cos(ang)).addScaledVector(w, Math.sin(ang));
        // Base: on the neck wall itself (just above the parent artery), not on the dome.
        const along = 0.15 + rnd() * Math.min(cfg.spreadAlongNeck, 0.7);
        a = an.neckCenter.clone().addScaledVector(axis, along).addScaledVector(radial, an.neckRadius + 0.08);
        // Anchor: outward and slightly back toward the parent side, to the cistern wall.
        const len = cfg.length * (0.7 + rnd() * 0.6);
        b = a.clone().addScaledVector(radial, len).addScaledVector(axis, -len * 0.25).add(new THREE.Vector3(0, -0.3 - rnd() * 0.8, 0));
        mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -0.25, 0));
        if (free(b) && free(mid) && free(a.clone().lerp(b, 0.25))) break;
      }
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const mat = new THREE.MeshPhysicalMaterial({
        color: '#f4ede6',
        transparent: true,
        opacity: 0.75,
        roughness: 0.3,
        clearcoat: 1,
      });
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, cfg.radius * (0.7 + rnd() * 0.6), 6), mat);
      mesh.userData = { kind: 'adhesion', id: `adhesion-${i}`, labelKey: 'label.adhesion', index: i };
      mesh.renderOrder = 3;
      this.group.add(mesh);
      this.list.push({ mesh, a, b, strength: 1, broken: false, fade: 0 });
    }
  }

  get clearance(): number {
    return this.list.filter((s) => s.broken).length / this.list.length;
  }

  /** Distance from a point to an adhesion band (approximated by its chord). */
  distanceTo(i: number, p: THREE.Vector3): number {
    const s = this.list[i];
    return new THREE.Line3(s.a, s.b).closestPointToPoint(p, true, new THREE.Vector3()).distanceTo(p);
  }

  /** Weaken a band; returns true when it breaks. */
  weaken(i: number, amount: number): boolean {
    const s = this.list[i];
    if (s.broken) return false;
    s.strength -= amount;
    (s.mesh.material as THREE.MeshPhysicalMaterial).opacity = 0.3 + 0.45 * Math.max(0, s.strength);
    if (s.strength <= 0) {
      s.broken = true;
      s.mesh.userData.cut = true;
      return true;
    }
    return false;
  }

  update(dt: number): void {
    for (const s of this.list) {
      if (!s.broken || s.fade >= 1) continue;
      s.fade = Math.min(1, s.fade + dt / 0.35);
      (s.mesh.material as THREE.MeshPhysicalMaterial).opacity = 0.3 * (1 - s.fade);
      if (s.fade >= 1) s.mesh.visible = false;
    }
  }
}
