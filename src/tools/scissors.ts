import { audio } from '../audio/engine';
import { bus } from '../core/events';
import { state } from '../core/store';
import { MAJOR_ARTERIES, stressDome, toast } from './common';
import { ScissorsModel } from './models';
import { Tool, type HoverClass, type PickHit, type ToolContext } from './types';

/**
 * MICRO SCISSORS (key 2). Sharp opening of the arachnoid: click a membrane
 * segment to cut it. Also divides adhesion bands. Never cut what you cannot see:
 * vessels and nerves are highlighted red.
 */
export class ScissorsTool extends Tool {
  readonly id = 'scissors' as const;
  seesMembranes = true;
  private model = new ScissorsModel();
  private snipT = 1;

  constructor(ctx: ToolContext) {
    super(ctx);
    this.cursor.add(this.model);
  }

  classify(hit: PickHit | null): HoverClass {
    if (!hit) return null;
    switch (hit.kind) {
      case 'arachnoid':
      case 'adhesion':
        return 'ok';
      case 'vessel':
      case 'vein':
      case 'nerve':
      case 'dome':
      case 'bleb':
        return 'harm';
      case 'brain':
        return 'warn';
      default:
        return null;
    }
  }

  onDown(hit: PickHit | null): void {
    this.snipT = 0;
    audio.snip();
    if (!hit) return;
    const { anatomy, adhesions, fx } = this.ctx;
    switch (hit.kind) {
      case 'arachnoid': {
        const seg = anatomy.arachnoid.byId.get(hit.id);
        if (seg && anatomy.arachnoid.cut(seg, hit.point)) {
          state.arachnoidCut.add(seg.id);
          bus.emit('arachnoid:cut', { id: seg.id, kind: seg.kind });
          fx.burst(hit.point, { color: '#e8f4ff', count: 10, speed: 2, size: 0.25, life: 0.6, gravity: -1 });
          toast(seg.kind === 'fissure' ? 'toast.arachnoidCut' : 'toast.cisternOpened', 'ok', 1.2);
        }
        break;
      }
      case 'adhesion': {
        const i = hit.object.userData.index as number;
        if (adhesions.weaken(i, 2)) {
          state.neckClearance = adhesions.clearance;
          bus.emit('adhesion:broken', { index: i, clearance: state.neckClearance });
          toast('toast.adhesionFreed', 'ok', 0.8);
        }
        break;
      }
      case 'dome':
      case 'bleb':
        stressDome(hit.kind === 'bleb' ? 0.9 : 0.6);
        bus.emit('vessel:injured', { id: 'dome', point: hit.point.clone(), severity: 1 });
        toast('toast.domeCut', 'alarm', 0.5);
        break;
      case 'vessel':
        bus.emit('vessel:injured', { id: hit.id, point: hit.point.clone(), severity: MAJOR_ARTERIES.has(hit.id) ? 0.8 : 0.3 });
        toast('toast.vesselCut', 'alarm', 0.5);
        break;
      case 'vein':
        bus.emit('vessel:injured', { id: hit.id, point: hit.point.clone(), severity: 0.25 });
        toast('toast.veinCut', 'warn', 0.5);
        break;
      case 'nerve':
        toast('toast.nerveCut', 'alarm', 0.5);
        break;
    }
  }

  update(dt: number): void {
    // Snip animation: close quickly, reopen.
    if (this.snipT < 1) {
      this.snipT = Math.min(1, this.snipT + dt / 0.18);
      this.model.setOpen(Math.abs(this.snipT * 2 - 1));
    }
  }
}
