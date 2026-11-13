import * as THREE from 'three';
import { audio } from '../audio/engine';
import { bus } from '../core/events';
import { state } from '../core/store';
import type { Vessel } from '../anatomy/vessels';
import { toast } from './common';
import { buildClip } from './models';
import { Tool, type HoverClass, type PickHit, type ToolContext } from './types';

/** Proximal ICA segment where a temporary clip may go (fraction of the ICA spline). */
const PROXIMAL_T = 0.42;

/**
 * TEMPORARY CLIP (key 0). Click the PROXIMAL ICA to place it (proximal
 * control): pressure in the aneurysm drops, so bleeding slows and the dome
 * softens. The occlusion timer starts; long occlusion risks ischemia (watch the
 * MEP in M4). Click the temporary clip again to remove it.
 */
export class TempClipTool extends Tool {
  readonly id = 'tempClip' as const;
  private ghost: THREE.Group;
  private clip: THREE.Group | null = null;

  constructor(ctx: ToolContext) {
    super(ctx);
    this.ghost = buildClip({ variant: 'straight', bladeLength: 6, opening: 5, color: '#ffd27a', ghost: true });
    this.ghost.visible = false;
    ctx.scene.add(this.ghost);
  }

  private get ica(): Vessel {
    return this.ctx.anatomy.vessels.get('ica')!;
  }

  /** Closest parameter t on the ICA to a point. */
  private icaT(p: THREE.Vector3): number {
    let best = 0, bestD = Infinity;
    const q = new THREE.Vector3();
    for (let i = 0; i <= 100; i++) {
      this.ica.curve.getPointAt(i / 100, q);
      const d = q.distanceToSquared(p);
      if (d < bestD) (bestD = d), (best = i / 100);
    }
    return best;
  }

  classify(hit: PickHit | null): HoverClass {
    if (!hit) return null;
    if (hit.kind === 'tempClip') return 'warn';
    if (hit.kind === 'vessel' && hit.id === 'ica') return this.icaT(hit.point) <= PROXIMAL_T ? 'ok' : 'warn';
    return null;
  }

  /** Clip pose across the ICA at parameter t: jaws close across the lumen. */
  private poseAt(t: number, out: THREE.Object3D, opening: boolean): void {
    const P = this.ica.curve.getPointAt(t);
    const T = this.ica.curve.getTangentAt(t);
    const toCam = this.ctx.scope.camera.position.clone().sub(P).normalize();
    const y = toCam.addScaledVector(T, -toCam.dot(T)).normalize(); // perpendicular to the vessel
    const x = new THREE.Vector3().crossVectors(T, y).normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    out.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    const r = this.ica.radiusAt(t);
    out.position.copy(P).addScaledVector(y, -(r + (opening ? 1.6 : 1.2)));
  }

  update(_dt: number, hit: PickHit | null): void {
    this.cursor.visible = false;
    const show = !this.clip && hit?.kind === 'vessel' && hit.id === 'ica';
    this.ghost.visible = !!show;
    if (show && hit) this.poseAt(Math.min(this.icaT(hit.point), PROXIMAL_T), this.ghost, true);
  }

  deactivate(): void {
    this.ghost.visible = false;
  }

  onDown(hit: PickHit | null): void {
    if (!hit) return;
    if (hit.kind === 'tempClip') return this.remove();
    if (hit.kind !== 'vessel' || hit.id !== 'ica' || this.clip) return;
    const t = this.icaT(hit.point);
    if (t > PROXIMAL_T) {
      toast('toast.tempClipDistal', 'warn', 1);
      return;
    }
    const clip = buildClip({ variant: 'straight', bladeLength: 6, opening: 0.4, color: '#d9a640' });
    this.poseAt(t, clip, false);
    clip.traverse((o) => (o.userData = { kind: 'tempClip', id: 'tempClip', labelKey: 'label.tempClip' }));
    this.ctx.placed.add(clip);
    this.clip = clip;
    state.tempClip.on = true;
    state.tempClip.startedAt = state.elapsed;
    state.tempClip.episodes++;
    audio.click(1100);
    bus.emit('tempclip:on', {});
    toast('toast.tempClipOn', 'info', 0.5);
  }

  remove(): void {
    if (!this.clip) return;
    this.ctx.placed.remove(this.clip);
    this.clip = null;
    const duration = state.elapsed - state.tempClip.startedAt;
    state.tempClip.on = false;
    state.tempClip.totalSeconds += duration;
    audio.click(700);
    bus.emit('tempclip:off', { duration });
    toast('toast.tempClipOff', 'ok', 0.5);
  }
}
