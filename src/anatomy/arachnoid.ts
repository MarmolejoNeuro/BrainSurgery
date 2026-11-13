import * as THREE from 'three';
import { ANATOMY } from '../config/anatomy';
import { arachnoidMaterial } from './materials';
import { fbm3 } from './noise';
import { v3 } from './tube';

/**
 * Arachnoid: the thin, translucent membrane that bridges the sylvian fissure
 * and wraps the basal cisterns. It is opened SHARPLY with micro scissors;
 * releasing CSF lets the brain relax so the fissure can be split with little
 * retraction. Each segment can be cut individually.
 */
export interface ArachnoidSegment {
  id: string;
  kind: 'fissure' | 'cistern';
  mesh: THREE.Mesh;
  cut: boolean;
  /** Cut animation progress 0..1. */
  cutP: number;
  /** Fissure: position of the cut across the gap (0 = temporal edge, 1 = frontal edge). */
  cutV: number;
  x0?: number;
  x1?: number;
  yFrontal?: number;
  yTemporal?: number;
}

/** Fraction of each half that remains on the edge after the membrane recoils. */
const REMNANT = 0.16;

export class Arachnoid {
  readonly group = new THREE.Group();
  readonly segments: ArachnoidSegment[] = [];
  readonly byId = new Map<string, ArachnoidSegment>();
  readonly material: THREE.MeshPhysicalMaterial;
  private zF = 0;
  private zT = 0;

  constructor(heightAt: (lobe: 'frontal' | 'temporal', x: number, localZ: number) => number) {
    const cfg = ANATOMY.arachnoid;
    this.material = arachnoidMaterial(cfg.color, cfg.opacity);

    const n = cfg.fissureSegments;
    for (let i = 0; i < n; i++) {
      const x0 = cfg.fromX + ((cfg.toX - cfg.fromX) * i) / n;
      const x1 = cfg.fromX + ((cfg.toX - cfg.fromX) * (i + 1)) / n;
      const xm = (x0 + x1) / 2;
      const seg: ArachnoidSegment = {
        id: `fissure-${i}`,
        kind: 'fissure',
        mesh: new THREE.Mesh(new THREE.BufferGeometry(), this.material),
        cut: false,
        cutP: 0,
        cutV: 0.5,
        x0,
        x1,
        // Edge heights a little below the lobe surfaces so the sheet tucks under them.
        yFrontal: heightAt('frontal', xm, -1.2) - 0.6,
        yTemporal: heightAt('temporal', xm, 1.2) - 0.6,
      };
      this.add(seg);
    }

    for (const c of cfg.cisterns) {
      const geo = irregularPatch(c.size[0], c.size[1], c.id.length * 13);
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.position.copy(v3(c.center));
      mesh.rotation.set(c.rot[0], c.rot[1], c.rot[2]);
      this.add({ id: `cistern-${c.id}`, kind: 'cistern', mesh, cut: false, cutP: 0, cutV: 0.5 });
    }
  }

  private add(seg: ArachnoidSegment): void {
    seg.mesh.userData = { kind: 'arachnoid', id: seg.id, labelKey: 'label.arachnoid', cut: false };
    seg.mesh.renderOrder = 2;
    this.segments.push(seg);
    this.byId.set(seg.id, seg);
    this.group.add(seg.mesh);
  }

  get fissureSegments(): ArachnoidSegment[] {
    return this.segments.filter((s) => s.kind === 'fissure');
  }

  /** Fraction of superficial fissure segments opened (0..1). */
  get fissureOpenFraction(): number {
    const f = this.fissureSegments;
    return f.filter((s) => s.cut).length / f.length;
  }

  /** Cut a segment at a world point. Returns false if it was already open. */
  cut(seg: ArachnoidSegment, point: THREE.Vector3): boolean {
    if (seg.cut) return false;
    seg.cut = true;
    seg.mesh.userData.cut = true;
    // Each opened segment gets its own material so its remnant can fade independently.
    seg.mesh.material = this.material.clone();
    if (seg.kind === 'fissure') {
      seg.cutV = THREE.MathUtils.clamp((point.z - this.zT) / (this.zF - this.zT), 0.2, 0.8);
    }
    return true;
  }

  /** Animate recoiling membranes. */
  update(dt: number): void {
    for (const s of this.segments) {
      if (!s.cut || s.cutP >= 1) continue;
      s.cutP = Math.min(1, s.cutP + dt / 0.45);
      const ease = 1 - Math.pow(1 - s.cutP, 3);
      const mat = s.mesh.material as THREE.MeshPhysicalMaterial;
      mat.opacity = this.material.opacity * (1 - 0.45 * ease);
      if (s.kind === 'fissure') this.rebuildFissure(s);
      else {
        // Cistern membrane shrinks back to a ragged rim and disappears.
        s.mesh.scale.setScalar(1 - 0.85 * ease);
        mat.opacity = this.material.opacity * (1 - ease);
        if (s.cutP >= 1) s.mesh.visible = false;
      }
    }
  }

  /** Re-stretch fissure sheets between the current frontal and temporal edges. */
  setFissureEdges(frontalFaceZ: number, temporalFaceZ: number): void {
    this.zF = frontalFaceZ - ANATOMY.arachnoid.overlap;
    this.zT = temporalFaceZ + ANATOMY.arachnoid.overlap;
    for (const s of this.segments) if (s.kind === 'fissure') this.rebuildFissure(s);
  }

  private rebuildFissure(s: ArachnoidSegment): void {
    let ranges: [number, number][] = [[0, 1]];
    if (s.cut) {
      const ease = 1 - Math.pow(1 - s.cutP, 3);
      // Each half recoils toward its own lobe edge.
      const a = s.cutV * (1 - (1 - REMNANT) * ease);
      const b = 1 - (1 - s.cutV) * (1 - (1 - REMNANT) * ease);
      ranges = [[0, a], [b, 1]];
    }
    s.mesh.geometry.dispose();
    s.mesh.geometry = fissureSheet(s.x0!, s.x1!, this.zF, s.yFrontal!, this.zT, s.yTemporal!, ANATOMY.arachnoid.sag, ranges);
  }

  setOpacity(o: number): void {
    this.material.opacity = o;
    for (const s of this.segments) if (s.cut) (s.mesh.material as THREE.MeshPhysicalMaterial).opacity = o * 0.55;
  }
}

/**
 * A gently sagging sheet spanning from the temporal edge (v = 0) to the frontal
 * edge (v = 1), restricted to the given v ranges (two ranges once cut).
 */
function fissureSheet(
  x0: number, x1: number,
  zF: number, yF: number,
  zT: number, yT: number,
  sag: number,
  ranges: [number, number][],
): THREE.BufferGeometry {
  const nx = 6, nz = 10;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const [v0, v1] of ranges) {
    if (v1 - v0 < 1e-3) continue;
    const base = pos.length / 3;
    for (let i = 0; i <= nx; i++) {
      const x = x0 + ((x1 - x0) * i) / nx;
      for (let j = 0; j <= nz; j++) {
        const v = v0 + ((v1 - v0) * j) / nz;
        const z = zT + (zF - zT) * v;
        const y = yT + (yF - yT) * v - sag * 4 * v * (1 - v) + (fbm3(x * 0.4, v * 3, 0, 2, 5) - 0.5) * 0.4;
        pos.push(x, y, z);
        uv.push(x / 12, z / 12);
      }
    }
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const a = base + i * (nz + 1) + j, b = base + (i + 1) * (nz + 1) + j;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Horizontal membrane patch with a ragged edge and a slight dome. */
function irregularPatch(w: number, h: number, seed: number): THREE.BufferGeometry {
  const geo = new THREE.CircleGeometry(0.5, 48, 0, Math.PI * 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const r = Math.hypot(x, y);
    const a = Math.atan2(y, x);
    const k = r > 0.49 ? 0.75 + 0.5 * fbm3(Math.cos(a) * 2, Math.sin(a) * 2, seed, 3, seed) : 1;
    pos.setXYZ(i, x * w * k, y * h * k, (0.25 - r * r) * 2.2);
  }
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 12, uv.getY(i) * h / 12);
  return geo;
}
