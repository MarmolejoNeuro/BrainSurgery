import * as THREE from 'three';
import { bus } from '../core/events';
import { state } from '../core/store';
import { stressDome, toast, touchStructure } from './common';
import { dissectorModel } from './models';
import { Tool, type HoverClass, type PickHit, type ToolContext } from './types';

/**
 * MICRODISSECTOR (key 4). Blunt dissection. Press and stroke along the neck to
 * free the adhesion bands (neck clearance). Touching a vessel or nerve with it
 * confirms its identity. Pushing on the dome, especially fast or on the bleb,
 * raises the (hidden) rupture risk. Fast, rough strokes tear rather than
 * dissect: a band torn at speed, or a vessel scraped quickly, avulses a tiny
 * perforator and starts an ooze (bipolar stops it).
 */
/** Tip speed (mm/s) above which a stroke tears instead of dissecting. */
const ROUGH_SPEED = 25;
/** Tip speed (mm/s) above which sliding along a vessel wall injures a perforator. */
const SCRAPE_SPEED = 35;

export class DissectorTool extends Tool {
  readonly id = 'dissector' as const;
  private lastTip = new THREE.Vector3();
  private hasLast = false;
  /** Builds up while the tip scrapes a vessel at speed; at 1 a small perforator tears. */
  private scrape = 0;
  private lastObj: THREE.Object3D | null = null;
  /**
   * Stroke speed (mm/s) measured only while the tip stays on one surface, so
   * the jump when the pointer crosses from one structure to another (a depth
   * discontinuity) never reads as a fast stroke.
   */
  private strokeSpeed = 0;

  constructor(ctx: ToolContext) {
    super(ctx);
    this.cursor.add(dissectorModel());
  }

  classify(hit: PickHit | null): HoverClass {
    if (!hit) return null;
    if (hit.kind === 'dome' || hit.kind === 'bleb') return 'warn';
    if (hit.kind === 'adhesion' || hit.kind === 'vessel' || hit.kind === 'nerve') return 'ok';
    if (this.nearNeck(hit.point)) return 'ok';
    return null;
  }

  private nearNeck(p: THREE.Vector3): boolean {
    const an = this.ctx.anatomy.aneurysm;
    return p.distanceTo(an.neckCenter) < an.neckRadius + 3;
  }

  private weaken(i: number, amount: number, rough: boolean): void {
    const { adhesions } = this.ctx;
    if (adhesions.weaken(i, amount)) {
      state.neckClearance = adhesions.clearance;
      bus.emit('adhesion:broken', { index: i, clearance: state.neckClearance });
      if (rough) {
        // Torn, not dissected: the small vessel running in the band bleeds at its base.
        bus.emit('vessel:injured', { id: 'perforator', point: adhesions.list[i].a.clone(), severity: 0.3 });
        toast('toast.roughTear', 'warn', 0);
      } else toast('toast.adhesionFreed', 'ok', 0.8);
    }
  }

  onDown(hit: PickHit | null): void {
    this.hasLast = false;
    if (hit && (hit.kind === 'vessel' || hit.kind === 'nerve')) touchStructure(hit.id, this.id);
  }

  update(dt: number, hit: PickHit | null, pressed: boolean, tipSpeed: number): void {
    if (!pressed || !hit) {
      this.hasLast = false;
      return;
    }
    const tip = hit.point;
    const sameSurface = this.hasLast && hit.object === this.lastObj;
    const moved = sameSurface ? tip.distanceTo(this.lastTip) : 0;
    if (sameSurface && dt > 0) this.strokeSpeed += (moved / dt - this.strokeSpeed) * Math.min(1, dt * 12);
    else if (!this.hasLast) this.strokeSpeed = 0;
    this.lastTip.copy(tip);
    this.lastObj = hit.object;
    this.hasLast = true;

    if (hit.kind === 'vessel' || hit.kind === 'nerve') touchStructure(hit.id, this.id);

    // Scraping a vessel at speed avulses a small perforator.
    if (hit.kind === 'vessel' && this.strokeSpeed > SCRAPE_SPEED) {
      this.scrape += dt * (this.strokeSpeed - SCRAPE_SPEED) / 15;
      if (this.scrape >= 1) {
        this.scrape = 0;
        bus.emit('vessel:injured', { id: 'perforator', point: hit.point.clone(), severity: 0.3 });
        toast('toast.roughTear', 'warn', 0);
      }
    } else this.scrape = Math.max(0, this.scrape - dt * 0.2);

    // Free adhesions the tip sweeps past (slow, deliberate strokes work best).
    const { adhesions } = this.ctx;
    if (moved > 0) {
      const rough = this.strokeSpeed >= ROUGH_SPEED;
      const gentle = rough ? 0.5 : 1;
      const an = this.ctx.anatomy.aneurysm;
      const inNeckZone = tip.distanceTo(an.neckCenter) < an.neckRadius + 3.5;
      let nearest = -1, nearestD = Infinity;
      adhesions.list.forEach((s, i) => {
        if (s.broken) return;
        const d = adhesions.distanceTo(i, tip);
        if (d < nearestD) (nearestD = d), (nearest = i);
        // Direct contact with a band frees it quickly.
        if (d <= 1.2) this.weaken(i, moved * 0.45 * gentle, rough);
      });
      // Blunt strokes around the neck also free nearby bands hidden behind it.
      if (inNeckZone && nearest >= 0 && nearestD > 1.2 && nearestD < 5) this.weaken(nearest, moved * 0.3 * gentle, rough);
    }

    // Manipulating the dome: stress scales with stroke speed; bleb is fragile.
    if (hit.kind === 'dome' || hit.kind === 'bleb') {
      const k = hit.kind === 'bleb' ? 3 : 1;
      stressDome(dt * (0.01 + tipSpeed * 0.0025) * k);
      toast(tipSpeed > 15 ? 'toast.domeRough' : 'toast.domeTouch', 'warn');
    }
  }
}
