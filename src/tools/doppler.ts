import { audio } from '../audio/engine';
import { bus } from '../core/events';
import { state } from '../core/store';
import { arterialWave } from '../physics/heart';
import { toast, touchStructure } from './common';
import { dopplerModel } from './models';
import { Tool, type HoverClass, type PickHit, type ToolContext } from './types';

/**
 * MICRO DOPPLER (key 8). Rest the probe tip on a vessel: a pulsatile "whoosh"
 * means flow; silence means no flow (occluded). After clipping it confirms
 * the PCom and anterior choroidal artery are still open and the dome is not.
 */
export class DopplerTool extends Tool {
  readonly id = 'doppler' as const;
  private contact = 0;
  private contactId = '';
  private reported = false;

  constructor(ctx: ToolContext) {
    super(ctx);
    this.cursor.add(dopplerModel());
  }

  classify(hit: PickHit | null): HoverClass {
    if (!hit) return null;
    return hit.kind === 'vessel' || hit.kind === 'dome' || hit.kind === 'bleb' ? 'ok' : null;
  }

  deactivate(): void {
    audio.doppler(false, 0, 0);
  }

  update(dt: number, hit: PickHit | null): void {
    const onVessel = !!hit && (hit.kind === 'vessel' || hit.kind === 'dome' || hit.kind === 'bleb');
    if (!onVessel || !hit) {
      this.contact = 0;
      audio.doppler(false, 0, 0);
      return;
    }
    const id = hit.kind === 'vessel' ? hit.id : 'dome';
    if (id !== this.contactId) {
      this.contactId = id;
      this.contact = 0;
      this.reported = false;
    }
    this.contact += dt;
    const flow = state.flow[id] ?? 1;
    // Blood velocity follows the arterial waveform; flow scales it.
    const velocity = arterialWave(this.ctx.heart.phase) * flow;
    audio.doppler(true, velocity, flow, state.flowPitch[id] ?? 1);
    if (this.contact > 0.6 && hit.kind === 'vessel') touchStructure(id, this.id);
    if (this.contact > 0.6 && !this.reported) {
      this.reported = true;
      bus.emit('doppler:checked', { id, flow });
    }
    if (this.contact > 0.6) toast(flow > 0.02 ? 'toast.dopplerFlow' : 'toast.dopplerNoFlow', flow > 0.02 ? 'info' : 'warn', 3);
  }
}
