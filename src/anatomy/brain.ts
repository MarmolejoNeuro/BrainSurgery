import * as THREE from 'three';
import { ANATOMY } from '../config/anatomy';
import { brainMaterial, duraMaterial, veinMaterial } from './materials';
import { fbm3, sulcusField } from './noise';
import { buildTube } from './tube';

type LobeCfg = typeof ANATOMY.frontalLobe;

/**
 * Build one opercular lobe as a gyral superellipsoid.
 *
 * Local frame: the lobe's face toward the sylvian fissure lies at z = 0.
 * side = direction the lobe extends from its face: -1 for the frontal lobe
 * (anterior, -Z), +1 for the temporal lobe (posterior, +Z).
 */
export function buildLobe(cfg: LobeCfg, side: 1 | -1, id: "frontal" | "temporal", seed: number): THREE.Mesh {
  const [rx, ry, rz] = cfg.radii;
  const e = cfg.exponent;
  const geo = new THREE.SphereGeometry(1, 220, 160);
  // Put the UV poles on the medial/lateral ends (out of view), not on top.
  geo.rotateZ(Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(cfg.color);
  const sulcusColor = new THREE.Color('#8f4a45');
  const crestColor = base.clone().offsetHSL(0, -0.05, 0.06);
  const d = new THREE.Vector3();
  const center = new THREE.Vector3(cfg.center[0], cfg.center[1], side * rz);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    // Scale direction so that |x/rx|^e + |y/ry|^e + |z/rz|^e = 1 (superellipsoid).
    const s = Math.pow(
      Math.pow(Math.abs(d.x / rx), e) + Math.pow(Math.abs(d.y / ry), e) + Math.pow(Math.abs(d.z / rz), e),
      -1 / e,
    );
    const p = d.clone().multiplyScalar(s);
    // Approximate outward normal of the superellipsoid for displacement.
    const nrm = new THREE.Vector3(
      Math.sign(p.x) * Math.pow(Math.abs(p.x / rx), e - 1) / rx,
      Math.sign(p.y) * Math.pow(Math.abs(p.y / ry), e - 1) / ry,
      Math.sign(p.z) * Math.pow(Math.abs(p.z / rz), e - 1) / rz,
    ).normalize();
    const w = p.clone().add(center); // world-ish coords for noise continuity
    // Sulci are narrow grooves between broad, rounded gyri.
    const sul = sulcusField(w.x, w.y, w.z, cfg.gyralScale, seed);
    const bulge = fbm3(w.x * 0.06, w.y * 0.06, w.z * 0.06, 3, seed + 9) - 0.5;
    const disp = -sul * cfg.gyralAmplitude * 1.6 + bulge * cfg.gyralAmplitude * 1.2;
    p.addScaledVector(nrm, disp).add(center);
    pos.setXYZ(i, p.x, p.y, p.z);

    tmp.copy(crestColor).lerp(base, 0.5 + bulge).lerp(sulcusColor, sul * 0.75);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, brainMaterial(ANATOMY.pulsation.brain));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { kind: 'brain', id, labelKey: `label.${id}` };
  return mesh;
}

/** Height of a lobe's surface at local (x, z), found by casting a ray downward. */
export function surfaceHeight(mesh: THREE.Mesh, x: number, z: number): number | null {
  const rc = new THREE.Raycaster(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
  mesh.updateMatrixWorld();
  const hit = rc.intersectObject(mesh, false)[0];
  return hit ? hit.point.y : null;
}

/**
 * Superficial sylvian vein: drains the opercular surfaces and runs along the
 * fissure. The fissure is usually opened on its FRONTAL side to spare it.
 * Built in the temporal lobe's local frame by draping onto its surface.
 */
export function buildSylvianVein(temporal: THREE.Mesh): THREE.Mesh | null {
  const cfg = ANATOMY.superficialSylvianVein;
  const pts: THREE.Vector3[] = [];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const x = cfg.fromX + ((cfg.toX - cfg.fromX) * i) / n;
    const z = cfg.offsetFromEdge + Math.sin(i * 0.9) * 0.4;
    const y = surfaceHeight(temporal, x, z);
    if (y !== null) pts.push(new THREE.Vector3(x, y + cfg.radius * 0.55, z));
  }
  if (pts.length < 3) return null;
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const geo = buildTube(curve, { radius: (t) => cfg.radius * (0.75 + 0.25 * t), flatten: 0.7 });
  const mesh = new THREE.Mesh(geo, veinMaterial(cfg.color));
  mesh.castShadow = true;
  mesh.userData = { kind: 'vein', id: 'ssv', labelKey: 'label.vein' };
  return mesh;
}

/** Skull base floor covered by dura, deep under everything. */
export function buildSkullBase(): THREE.Mesh {
  const cfg = ANATOMY.skullBase;
  const geo = new THREE.PlaneGeometry(140, 140, 120, 120);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(cfg.color);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const n = fbm3(x * 0.08, 0, z * 0.08, 4, 21);
    pos.setY(i, cfg.y + (n - 0.5) * 3);
    tmp.copy(base).offsetHSL(0, 0, (n - 0.5) * 0.12);
    colors.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, duraMaterial('#ffffff'));
  mesh.receiveShadow = true;
  mesh.userData = { kind: 'dura', id: 'skullBase', labelKey: 'label.skullBase' };
  return mesh;
}
