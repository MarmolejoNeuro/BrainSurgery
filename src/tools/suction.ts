import { audio } from '../audio/engine';
import { distanceToDome, stressDome, toast } from './common';
import { suctionModel } from './models';
import { Tool, type HoverClass, type PickHit, type ToolContext } from './types';

/**
 * SUCTION (key 1). Held in the LEFT hand. Clears blood and CSF (blood arrives
 * in M4). A strong suction tip near the thin dome can tear it, so keep it away
 * or turn the suction down by working at a distance.
 */
export class SuctionTool extends Tool {
  readonly id = 'suction' as const;
  hand = 'left' as const;

  constructor(ctx: ToolContext) {
    super(ctx);
    this.cursor.add(suctionModel());
  }

  classify(hit: PickHit | null): HoverClass {
    if (!hit) return null;
    if (hit.kind === 'dome' || hit.kind === 'bleb') return 'warn';
    if (hit.kind === 'blood') return 'ok';
    return null;
  }

  onDown(): void {
    audio.suction(true);
  }

  onUp(): void {
    audio.suction(false);
  }

  deactivate(): void {
    audio.suction(false);
  }

  update(dt: number, hit: PickHit | null, pressed: boolean): void {
    if (!pressed || !hit) return;
    const removed = this.ctx.blood.suction(hit.point, dt);
    audio.suctionLoad(removed > 0);
    const d = distanceToDome(this.ctx.anatomy, hit.point);
    if (d < 1.5) {
      // Closer = more traction on the wall; the bleb is the weakest spot.
      stressDome(dt * 0.05 * (1.5 - d) * (hit.kind === 'bleb' ? 3 : 1));
      toast('toast.suctionDome', 'warn');
    }
  }
}
