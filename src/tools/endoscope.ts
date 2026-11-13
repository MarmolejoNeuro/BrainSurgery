import * as THREE from 'three';
import { bus } from '../core/events';
import { state } from '../core/store';
import { toast } from './common';
import { endoscopeModel } from './models';
import { Tool, type HoverClass, type PickHit, type ToolContext } from './types';

/**
 * ENDOSCOPE (key 9). A 30° endoscope shows what the microscope cannot: the
 * far side of the neck, the PCom origin and the anterior choroidal artery
 * behind the dome. Move it to a spot beside the aneurysm and click to park it;
 * the picture-in-picture view stays on. Press 9 again while parked to withdraw.
 */
export class EndoscopeTool extends Tool {
  readonly id = 'endoscope' as const;
  hand = 'left' as const;
  /** Where the lens sits and what it looks at (world). */
  readonly lensPos = new THREE.Vector3();
  readonly lookAt = new THREE.Vector3();
  live = false;
  private parkedModel: THREE.Group | null = null;

  constructor(ctx: ToolContext) {
    super(ctx);
    this.cursor.add(endoscopeModel());
  }

  classify(hit: PickHit | null): HoverClass {
    if (!hit) return null;
    if (hit.kind === 'dome' || hit.kind === 'bleb') return 'warn';
    return 'ok';
  }

  activate(): void {
    this.live = true;
  }

  deactivate(): void {
    this.live = false;
  }

  update(_dt: number, hit: PickHit | null): void {
    if (!hit || state.endoscopeParked) return;
    this.setLens(hit);
  }

  private setLens(hit: PickHit): void {
    // Lens slightly off the surface, aimed at the aneurysm neck.
    this.lensPos.copy(hit.point).addScaledVector(hit.normal, 1.2);
    this.lookAt.copy(this.ctx.anatomy.aneurysm.neckCenter);
  }

  onDown(hit: PickHit | null): void {
    if (!hit) return;
    this.setLens(hit);
    this.park(hit);
  }

  private park(_hit: PickHit): void {
    if (this.parkedModel) this.ctx.placed.remove(this.parkedModel);
    const m = endoscopeModel();
    m.position.copy(this.cursor.position);
    m.quaternion.copy(this.cursor.quaternion);
    m.traverse((o) => (o.userData = { kind: 'scope', id: 'scope', labelKey: 'label.endoscope' }));
    this.ctx.placed.add(m);
    this.parkedModel = m;
    state.endoscopeParked = true;
    bus.emit('endoscope:parked', { parked: true });
    toast('toast.scopeParked', 'info', 0.5);
  }

  withdraw(): void {
    if (this.parkedModel) this.ctx.placed.remove(this.parkedModel);
    this.parkedModel = null;
    state.endoscopeParked = false;
    bus.emit('endoscope:parked', { parked: false });
  }

  /** The PiP shows while the tool is held or the scope is parked. */
  get showPip(): boolean {
    return this.live || state.endoscopeParked;
  }
}
