import * as THREE from 'three';
import type { Anatomy } from '../anatomy';
import type { Vessel } from '../anatomy/vessels';
import type { PlacedClip } from '../tools/clip';

/**
 * CLIP EVALUATION (geometry-based, simplified).
 *
 * A clip excludes an aneurysm by flattening its neck between the blades:
 *  - The neck (a short tube along the aneurysm axis A) must pass BETWEEN the
 *    blades, so the clip's blade plane should be roughly perpendicular to A.
 *  - The closed blade line must cross the neck close to its centre and be long
 *    enough to cover the flattened neck (about half its circumference, π·r):
 *    the classic rule "blade length ≥ 1.5 × neck width".
 *  - Height above the parent wall matters: too low narrows the ICA; too high
 *    leaves a residual neck ("dog-ear") or clamps the fragile dome itself.
 *  - The blades must not catch the PCom or the anterior choroidal artery,
 *    which arise right next to the neck.
 */
export interface ClipResult {
  /** Fraction of the neck closed (0..1). */
  coverage: number;
  /** Distance of the blade line from the neck centre, in the neck plane (mm). */
  lineOffset: number;
  /** Height of the blade line above the neck plane at the crossing (mm). */
  height: number;
  /** |cos| between blade-plane normal and aneurysm axis (1 = ideal). */
  alignment: number;
  residualNeckMm: number;
  /** ICA lumen narrowing 0..1. */
  icaStenosis: number;
  /** Remaining flow factors for branches (1 open, ~0.5 kinked, 0 occluded). */
  pcom: number;
  acha: number;
  /** Blades closed on the dome body rather than the neck. */
  onDome: boolean;
}

export interface Assessment {
  clipped: boolean;
  /** Fraction of normal inflow still reaching the dome (0 = excluded). */
  domeFlow: number;
  residualNeckMm: number;
  icaStenosis: number;
  pcom: number;
  acha: number;
  onDome: boolean;
  best: ClipResult | null;
}

const SAMPLES = 24;

/** Points along the closed blade centreline (straight or curved). */
export function bladePoints(clip: PlacedClip): THREE.Vector3[] {
  const g = clip.group;
  g.updateMatrixWorld(true);
  const pts: THREE.Vector3[] = [];
  const L = clip.bladeLength;
  for (let i = 0; i <= SAMPLES; i++) {
    const y = (L * i) / SAMPLES;
    const f = 1 - y / L;
    const z = clip.variant === 'curved' ? 2.2 * f * f : 0;
    pts.push(new THREE.Vector3(0, y, z).applyMatrix4(g.matrixWorld));
  }
  return pts;
}

function minDistToCurve(points: THREE.Vector3[], v: Vessel, t0: number, t1: number, n = 30): number {
  let best = Infinity;
  const q = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    v.curve.getPointAt(t0 + ((t1 - t0) * i) / n, q);
    for (const p of points) best = Math.min(best, p.distanceTo(q));
  }
  return best;
}

/** How a branch fares given its closest blade distance: open, kinked or occluded. */
function branchFactor(dist: number, radius: number): number {
  if (dist < radius + 0.3) return 0;
  if (dist < radius + 0.7) return 0.5;
  return 1;
}

export function evaluateClip(clip: PlacedClip, anatomy: Anatomy): ClipResult {
  const an = anatomy.aneurysm;
  const A = an.axis;
  const N = an.neckCenter;
  const pts = bladePoints(clip);

  // Blade-plane normal (local Z of the clip) vs aneurysm axis.
  const Z = new THREE.Vector3(0, 0, 1).applyQuaternion(clip.group.quaternion);
  const alignment = Math.abs(Z.dot(A));

  // Project the blade polyline onto the neck plane and find where it crosses.
  const proj = pts.map((p) => p.clone().addScaledVector(A, -p.clone().sub(N).dot(A)));
  const arc: number[] = [0];
  for (let i = 1; i < pts.length; i++) arc.push(arc[i - 1] + pts[i].distanceTo(pts[i - 1]));
  let ci = 0, lineOffset = Infinity;
  proj.forEach((q, i) => {
    const d = q.distanceTo(N);
    if (d < lineOffset) (lineOffset = d), (ci = i);
  });
  const height = pts[ci].clone().sub(N).dot(A);

  // Flattened neck width that the blades must cover.
  const rn = an.neckRadius;
  const w = Math.PI * rn;
  const c = arc[ci];
  const total = arc[arc.length - 1];
  const overlap = Math.max(0, Math.min(c + w / 2, total) - Math.max(c - w / 2, 0));
  let coverage = overlap / w;
  // Must actually cross the neck near its centre.
  coverage *= 1 - THREE.MathUtils.smoothstep(lineOffset, rn * 0.75, rn * 1.15);
  // Jaws must close across the neck tube, not along it.
  coverage *= THREE.MathUtils.smoothstep(alignment, 0.35, 0.75);
  // Blades within the footprint must stay in a sensible height band.
  const inBand = pts.filter((_p, i) => Math.abs(arc[i] - c) <= w / 2).map((p) => p.clone().sub(N).dot(A));
  if (inBand.length) coverage *= inBand.filter((hh) => hh > -0.8 && hh < 2.8).length / inBand.length;

  const onDome = height > 2.5;
  const residualNeckMm = coverage > 0.5 ? Math.max(0, height - 1.2) : 0;

  // ICA narrowing: how deep the blades reach into the parent lumen.
  const ica = anatomy.vessels.get('ica')!;
  let icaStenosis = 0;
  const q = new THREE.Vector3();
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    ica.curve.getPointAt(t, q);
    const r = ica.radiusAt(t);
    for (const p of pts) icaStenosis = Math.max(icaStenosis, THREE.MathUtils.clamp((r - p.distanceTo(q)) / (2 * r), 0, 1));
  }

  // Branch origins (skip the part buried inside the ICA wall).
  const pcomV = anatomy.vessels.get('pcom')!;
  const achaV = anatomy.vessels.get('acha')!;
  const pcom = branchFactor(minDistToCurve(pts, pcomV, 0.1, 0.4), pcomV.radiusAt(0.2));
  const acha = branchFactor(minDistToCurve(pts, achaV, 0.1, 0.4), achaV.radiusAt(0.2));

  return { coverage: onDome ? 0 : coverage, lineOffset, height, alignment, residualNeckMm, icaStenosis, pcom, acha, onDome };
}

/** Combine all permanent clips: the best one decides the neck, the worst one the branches. */
export function assess(clips: PlacedClip[], anatomy: Anatomy): Assessment {
  if (!clips.length) return { clipped: false, domeFlow: 1, residualNeckMm: 0, icaStenosis: 0, pcom: 1, acha: 1, onDome: false, best: null };
  const results = clips.map((c) => evaluateClip(c, anatomy));
  const best = results.reduce((a, b) => (b.coverage > a.coverage ? b : a));
  const residual = Math.min(...results.map((r) => 1 - r.coverage));
  return {
    clipped: true,
    domeFlow: residual < 0.05 ? 0 : residual,
    residualNeckMm: best.residualNeckMm,
    icaStenosis: Math.max(...results.map((r) => r.icaStenosis)),
    pcom: Math.min(...results.map((r) => r.pcom)),
    acha: Math.min(...results.map((r) => r.acha)),
    onDome: results.some((r) => r.onDome),
    best,
  };
}
