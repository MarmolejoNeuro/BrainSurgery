import * as THREE from 'three';
import { audio } from '../audio/engine';
import { SIM } from '../config/sim';
import { bus } from '../core/events';
import { state } from '../core/store';
import { evaluateClip } from '../procedure/clipEval';
import { stressDome, toast } from './common';
import { buildClip, type ClipVariant } from './models';
import { Tool, type HoverClass, type PickHit, type ToolContext } from './types';

/** A permanent clip placed in the field (geometry is evaluated in M5). */
export interface PlacedClip {
  group: THREE.Group;
  variant: ClipVariant;
  bladeLength: number;
  /** World positions of the blade tips' midpoint and the hinge. */
  tip: THREE.Vector3;
  hinge: THREE.Vector3;
  /** Jaw closing direction (world). */
  jaw: THREE.Vector3;
}

export const placedClips: PlacedClip[] = [];

const DEG = Math.PI / 180;

/**
 * ANEURYSM CLIP (key 6).
 *  - Move the mouse to position the open clip (ghost).
 *  - Q / E rotate the jaws around the applier axis; R / F tilt the applier.
 *  - Mouse wheel sets blade DEPTH (how far the blades go past the surface).
 *  - Shift + wheel changes blade length (clip size); Tab switches straight/curved.
 *  - Click to apply. Click an applied clip to remove it and try again.
 * The blades should run parallel to the parent ICA and cross the WHOLE neck,
 * without catching the PCom or anterior choroidal artery.
 */
export class ClipTool extends Tool {
  readonly id = 'clip' as const;
  variant: ClipVariant = 'straight';
  bladeLength = 7;
  depth = 2;
  /** Jaw rotation; the default -90° keeps the blades parallel to the parent ICA in the standard view. */
  roll = -Math.PI / 2;
  tilt = 0;
  /** Sideways tilt of the applier (around the screen's vertical axis). */
  yaw = 0;
  private ghost: THREE.Group;
  private lastHit: PickHit | null = null;

  constructor(ctx: ToolContext) {
    super(ctx);
    this.ghost = this.makeGhost();
    this.ctx.scene.add(this.ghost);
    this.ghost.visible = false;
  }

  private makeGhost(): THREE.Group {
    return buildClip({ variant: this.variant, bladeLength: this.bladeLength, opening: 3.8, color: '#9fe8ff', ghost: true });
  }

  private rebuildGhost(): void {
    const vis = this.ghost.visible;
    this.ctx.scene.remove(this.ghost);
    this.ghost = this.makeGhost();
    this.ghost.visible = vis;
    this.ctx.scene.add(this.ghost);
  }

  activate(): void {
    this.ghost.visible = true;
  }

  deactivate(): void {
    this.ghost.visible = false;
  }

  classify(hit: PickHit | null): HoverClass {
    if (!hit) return null;
    if (hit.kind === 'clip') return 'warn'; // click removes it
    const an = this.ctx.anatomy.aneurysm;
    if (hit.point.distanceTo(an.neckCenter) < an.neckRadius + 2.5) return 'ok';
    if (hit.kind === 'dome' || hit.kind === 'bleb') return 'warn';
    return null;
  }

  /** Pose of the clip for the current hit: tips deep, blades back toward the surgeon. */
  /** Pose an object as the clip would be for this hit (used by the ghost, application and demo mode). */
  pose(hit: PickHit, out: THREE.Object3D): void {
    const cam = this.ctx.scope.camera;
    const toCam = cam.position.clone().sub(hit.point).normalize();
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    // Applier axis: toward the microscope, tilted by R/F around the screen's horizontal axis.
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const axis = toCam.clone().applyAxisAngle(right, this.tilt).applyAxisAngle(up, this.yaw).normalize();
    const mid = hit.point.clone().addScaledVector(toCam, -this.depth);
    // Basis: Y = blade axis, X = jaw closing direction (rolled by Q/E).
    const y = axis;
    const x0 = new THREE.Vector3().crossVectors(y, new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1)).normalize();
    const x = x0.applyAxisAngle(y, this.roll);
    const z = new THREE.Vector3().crossVectors(x, y).normalize();
    out.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    out.position.copy(mid).addScaledVector(y, -this.bladeLength / 2);
  }

  update(_dt: number, hit: PickHit | null): void {
    if (hit && hit.kind !== 'clip') this.lastHit = hit;
    if (this.lastHit) this.pose(this.lastHit, this.ghost);
    this.ghost.visible = !!this.lastHit;
    this.cursor.visible = false; // the ghost clip is the cursor
  }

  onDown(hit: PickHit | null): void {
    if (hit?.kind === 'clip') {
      this.removeClip(hit.object);
      return;
    }
    if (!this.lastHit) return;
    const clip = buildClip({ variant: this.variant, bladeLength: this.bladeLength, opening: 0.05, color: '#c9ccd2' });
    this.pose(this.lastHit, clip);
    clip.updateMatrixWorld(true);
    clip.traverse((o) => (o.userData = { kind: 'clip', id: `clip-${placedClips.length}`, labelKey: 'label.clip' }));
    this.ctx.placed.add(clip);
    const placed: PlacedClip = {
      group: clip,
      variant: this.variant,
      bladeLength: this.bladeLength,
      tip: clip.localToWorld(new THREE.Vector3(0, 0, 0)),
      hinge: clip.localToWorld(new THREE.Vector3(0, this.bladeLength, 0)),
      jaw: new THREE.Vector3(1, 0, 0).applyQuaternion(clip.quaternion),
    };
    placedClips.push(placed);
    if (state.clearanceAtFirstClip < 0) state.clearanceAtFirstClip = state.neckClearance;
    // Closing the blades on the dome body (not the neck) can tear the thin wall.
    const result = evaluateClip(placed, this.ctx.anatomy);
    if (result.onDome) {
      stressDome(0.3);
      toast('toast.clipOnDome', 'alarm', 0.5);
    }
    state.clipCount = placedClips.length;
    audio.click(900);
    bus.emit('clip:applied', { index: placedClips.length - 1, variant: this.variant });
    if (result.onDome) {
      // already warned
    } else if (state.neckClearance < SIM.procedure.neckClearanceNeeded) {
      // Closing blades over an undissected neck can tear the dome or catch branches.
      stressDome(0.12);
      toast('toast.clipEarly', 'warn', 0.5);
    } else toast('toast.clipApplied', 'ok', 0.5);
  }

  removeClip(obj: THREE.Object3D): void {
    const i = placedClips.findIndex((c) => {
      let found = false;
      c.group.traverse((o) => (found ||= o === obj));
      return found;
    });
    if (i < 0) return;
    this.ctx.placed.remove(placedClips[i].group);
    placedClips.splice(i, 1);
    state.clipCount = placedClips.length;
    state.clipRemovals++;
    audio.click(600);
    bus.emit('clip:removed', { index: i });
    toast('toast.clipRemoved', 'info', 0.5);
  }

  onWheel(e: WheelEvent): boolean {
    if (e.shiftKey) {
      this.bladeLength = THREE.MathUtils.clamp(this.bladeLength + Math.sign(e.deltaY || e.deltaX) * -1, 4, 11);
      this.rebuildGhost();
    } else {
      this.depth = THREE.MathUtils.clamp(this.depth + Math.sign(e.deltaY) * -0.25, -1, 8);
    }
    return true;
  }

  onKey(e: KeyboardEvent): boolean {
    const k = e.key.toLowerCase();
    if (k === 'q') this.roll -= 10 * DEG;
    else if (k === 'e') this.roll += 10 * DEG;
    else if (k === 'r' && e.shiftKey) this.yaw = Math.min(this.yaw + 5 * DEG, 60 * DEG);
    else if (k === 'f' && e.shiftKey) this.yaw = Math.max(this.yaw - 5 * DEG, -60 * DEG);
    else if (k === 'r') this.tilt = Math.min(this.tilt + 5 * DEG, 60 * DEG);
    else if (k === 'f') this.tilt = Math.max(this.tilt - 5 * DEG, -60 * DEG);
    else if (e.key === 'Tab') {
      this.variant = this.variant === 'straight' ? 'curved' : 'straight';
      this.rebuildGhost();
    } else return false;
    return true;
  }
}
