import * as THREE from 'three';
import { ANATOMY } from '../config/anatomy';
import { aneurysmMaterial } from './materials';
import { fbm3 } from './noise';
import { v3 } from './tube';
import type { Vessel } from './vessels';

export interface Aneurysm {
  group: THREE.Group;
  dome: THREE.Mesh;
  bleb: THREE.Mesh;
  /** Geometry facts used later by dissection and clip evaluation. */
  neckCenter: THREE.Vector3;
  axis: THREE.Vector3;
  neckRadius: number;
  domeCenter: THREE.Vector3;
  domeRadius: number;
  blebCenter: THREE.Vector3;
}

/**
 * IC-PC aneurysm.
 *
 * It arises from the ICA wall exactly at the PCom origin (a hemodynamic stress
 * point at the branching) and here projects posterolaterally and inferiorly,
 * which is the classic direction toward the oculomotor nerve and tentorium.
 *
 * Built as a lathe: a short neck that flares into a spherical dome, revolved
 * around its own axis, then oriented along the projection vector.
 */
export function buildAneurysm(ica: Vessel): Aneurysm {
  const cfg = ANATOMY.aneurysm;
  const R = cfg.diameter / 2;
  const rn = cfg.neckWidth / 2;
  const L = cfg.neckLength;
  const axis = v3(cfg.projection).normalize();

  const icaPoint = ica.curve.getPointAt(cfg.icaT);
  const icaR = ica.radiusAt(cfg.icaT);
  // Neck plane sits on the ICA surface along the projection direction.
  const neckCenter = icaPoint.clone().addScaledVector(axis, icaR * 0.85);

  // Sphere center height above the neck plane so the neck circle lies on the sphere.
  const h = Math.sqrt(Math.max(R * R - rn * rn, 0.01));
  const yc = L + h;

  // Lathe profile (x = radius, y = along axis). Starts buried inside the ICA.
  const profile: THREE.Vector2[] = [];
  profile.push(new THREE.Vector2(rn * 0.98, -icaR * 0.9));
  profile.push(new THREE.Vector2(rn, -0.2));
  profile.push(new THREE.Vector2(rn * 0.96, L * 0.6));
  const phi0 = Math.asin(rn / R);
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const phi = phi0 + ((Math.PI - phi0) * i) / steps;
    // phi measured from the bottom pole of the dome sphere
    profile.push(new THREE.Vector2(Math.max(R * Math.sin(phi), 0.0001), yc - R * Math.cos(phi)));
  }
  const geo = new THREE.LatheGeometry(profile, 64);

  // Slight lobulation and vertex colors: thick red base, thinner paler dome.
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const cBase = new THREE.Color(cfg.colorBase);
  const cDome = new THREE.Color(cfg.colorDome);
  const cPlaque = new THREE.Color('#e7c6a4');
  const tmp = new THREE.Color();
  const p = new THREE.Vector3();
  const top = yc + R;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const f = THREE.MathUtils.clamp(p.y / top, 0, 1);
    if (p.y > L) {
      const n = fbm3(p.x * 0.6, p.y * 0.6, p.z * 0.6, 3, 41) - 0.5;
      const radial = new THREE.Vector3(p.x, p.y - yc, p.z).normalize();
      p.addScaledVector(radial, n * 0.35 * f);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    const plaque = Math.max(0, fbm3(p.x * 1.4, p.y * 1.4, p.z * 1.4, 2, 77) - 0.68) * 3;
    tmp.copy(cBase).lerp(cDome, Math.pow(f, 1.4)).lerp(cPlaque, Math.min(plaque, 0.6) * (1 - f));
    colors.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = aneurysmMaterial(cfg.pulse);
  const dome = new THREE.Mesh(geo, mat);
  dome.castShadow = true;
  dome.receiveShadow = true;
  dome.userData = { kind: 'dome', id: 'dome', labelKey: 'label.dome' };

  const group = new THREE.Group();
  group.position.copy(neckCenter);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  group.add(dome);

  // Bleb: a small, darker, thin-walled daughter sac on the dome.
  const domeCenterLocal = new THREE.Vector3(0, yc, 0);
  const blebDirWorld = v3(cfg.bleb.direction).normalize();
  const blebDirLocal = blebDirWorld.clone().applyQuaternion(group.quaternion.clone().invert());
  const blebGeo = new THREE.SphereGeometry(cfg.bleb.radius, 28, 20);
  const bpos = blebGeo.attributes.position as THREE.BufferAttribute;
  const bcol = new Float32Array(bpos.count * 3);
  const cBleb = new THREE.Color(cfg.colorBleb);
  for (let i = 0; i < bpos.count; i++) bcol.set([cBleb.r, cBleb.g, cBleb.b], i * 3);
  blebGeo.setAttribute('color', new THREE.BufferAttribute(bcol, 3));
  const bleb = new THREE.Mesh(blebGeo, mat);
  bleb.position.copy(domeCenterLocal).addScaledVector(blebDirLocal, R - cfg.bleb.radius * 0.35);
  bleb.castShadow = true;
  bleb.userData = { kind: 'bleb', id: 'bleb', labelKey: 'label.bleb' };
  group.add(bleb);
  group.updateMatrixWorld(true);

  return {
    group,
    dome,
    bleb,
    neckCenter: neckCenter.clone(),
    axis,
    neckRadius: rn,
    domeCenter: dome.localToWorld(domeCenterLocal.clone()),
    domeRadius: R,
    blebCenter: bleb.getWorldPosition(new THREE.Vector3()),
  };
}
