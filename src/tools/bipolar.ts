import * as THREE from 'three';
import { audio } from '../audio/engine';
import { bus } from '../core/events';
import { MAJOR_ARTERIES, stressDome, toast } from './common';
import { BipolarModel } from './models';
import { Tool, type HoverClass, type PickHit, type ToolContext } from './types';

/** Seconds of continuous contact needed to coagulate a point. */
const COAG_TIME = 0.8;

/**
 * BIPOLAR FORCEPS (key 3). Hold the button on a small bleeding point for about
 * a second to coagulate it. Never coagulate the parent arteries or the dome:
 * they are highlighted red.
 */
export class BipolarTool extends Tool {
  readonly id = 'bipolar' as const;
  private model = new BipolarModel();
  private holdT = 0;
  private holdPoint = new THREE.Vector3();
  private done = false;

  constructor(ctx: ToolContext) {
    super(ctx);
    this.cursor.add(this.model);
  }

  classify(hit: PickHit | null): HoverClass {
    if (!hit) return null;
    if (hit.kind === 'bleeder') return hit.object.userData.labelKey === 'label.ruptureSite' ? 'harm' : 'ok';
    const near = this.ctx.blood.nearestActive(hit.point, 1.5);
    if (near && near.kind !== 'arterial') return 'ok';
    if (hit.kind === 'dome' || hit.kind === 'bleb' || hit.kind === 'nerve') return 'harm';
    if (hit.kind === 'vessel') return MAJOR_ARTERIES.has(hit.id) ? 'harm' : 'warn';
    if (hit.kind === 'vein') return 'warn';
    if (hit.kind === 'brain' || hit.kind === 'arachnoid') return 'ok';
    return null;
  }

  onDown(hit: PickHit | null): void {
    this.holdT = 0;
    this.done = false;
    if (hit) this.holdPoint.copy(hit.point);
  }

  onUp(): void {
    audio.bipolar(false);
    this.model.setGap(1);
  }

  deactivate(): void {
    this.onUp();
  }

  update(dt: number, hit: PickHit | null, pressed: boolean): void {
    if (!pressed || !hit || this.done) {
      if (!pressed) this.model.setGap(1);
      audio.bipolar(false);
      return;
    }
    // Contact must stay on roughly the same spot.
    if (hit.point.distanceTo(this.holdPoint) > 1.2) {
      this.holdPoint.copy(hit.point);
      this.holdT = 0;
    }
    this.holdT += dt;
    this.model.setGap(Math.max(0.15, 1 - this.holdT / COAG_TIME));
    audio.bipolar(true);
    if (Math.random() < dt * 25) {
      this.ctx.fx.burst(hit.point, { color: '#ffe9b0', count: 3, speed: 3, size: 0.18, life: 0.2, gravity: 0 });
    }
    if (this.holdT >= COAG_TIME) {
      this.done = true;
      audio.bipolar(false);
      // Puff of steam: water in the tissue boils at the forceps tips.
      this.ctx.fx.burst(hit.point, { color: '#d8d8d8', count: 18, speed: 1.6, size: 0.6, life: 0.9, gravity: 2 });
      // A bleeding point under the tips takes priority over the tissue it sits on.
      const bleeder = this.ctx.blood.nearestActive(hit.point, 1.5);
      bus.emit('bipolar:coag', { point: hit.point.clone(), targetId: bleeder?.id ?? hit.id });
      if (bleeder && bleeder.kind !== 'arterial') return;
      if (hit.kind === 'dome' || hit.kind === 'bleb') {
        stressDome(0.5);
        bus.emit('vessel:injured', { id: 'dome', point: hit.point.clone(), severity: 1 });
        toast('toast.coagDome', 'alarm', 0.5);
      } else if (hit.kind === 'vessel' && MAJOR_ARTERIES.has(hit.id)) {
        bus.emit('vessel:injured', { id: hit.id, point: hit.point.clone(), severity: 0.7 });
        toast('toast.coagArtery', 'alarm', 0.5);
      } else if (hit.kind === 'nerve') {
        toast('toast.coagNerve', 'alarm', 0.5);
      } else {
        toast('toast.coagDone', 'ok', 1);
      }
    }
  }
}
