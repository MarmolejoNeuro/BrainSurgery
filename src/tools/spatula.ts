import { bus } from '../core/events';
import { toast } from './common';
import { spatulaCursorModel } from './models';
import { Tool, type HoverClass, type PickHit, type ToolContext } from './types';

/**
 * BRAIN SPATULA (key 5). Drag UP to widen retraction, DOWN to relax it.
 * Retraction is limited until the superficial arachnoid is opened. Keep it
 * gentle: beyond the safe range the brain blanches and retraction pressure
 * accumulates.
 */
export class SpatulaTool extends Tool {
  readonly id = 'spatula' as const;

  constructor(ctx: ToolContext) {
    super(ctx);
    this.cursor.add(spatulaCursorModel());
  }

  classify(hit: PickHit | null): HoverClass {
    if (!hit) return null;
    if (hit.kind === 'spatula' || hit.kind === 'brain') return 'ok';
    return null;
  }

  onDrag(_hit: PickHit | null, _dx: number, dy: number): void {
    const an = this.ctx.anatomy;
    const want = an.retraction - dy * 0.003;
    const limit = an.retractionLimit;
    if (want > limit && dy < 0) toast(limit < 0.99 ? 'toast.retractionLimited' : 'toast.retractionMax', 'warn');
    const next = Math.min(want, limit);
    if (Math.abs(next - an.retraction) > 1e-4) {
      an.setRetraction(next);
      bus.emit('retraction:changed', { value: an.retraction });
    }
  }
}
