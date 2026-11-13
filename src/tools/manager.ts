import * as THREE from 'three';
import { ANATOMY } from '../config/anatomy';
import { bus } from '../core/events';
import { state } from '../core/store';
import { BipolarTool } from './bipolar';
import { ClipTool } from './clip';
import { toast } from './common';
import { DissectorTool } from './dissector';
import { DopplerTool } from './doppler';
import { EndoscopeTool } from './endoscope';
import { ScissorsTool } from './scissors';
import { SpatulaTool } from './spatula';
import { SuctionTool } from './suction';
import { TempClipTool } from './tempClip';
import { TOOL_ORDER, Tool, ownerOf, type HoverClass, type PickHit, type ToolContext, type ToolId } from './types';

export interface ToolManagerHooks {
  /** Show an outline on the hovered target (or clear it). */
  highlight(objects: THREE.Object3D[], cls: HoverClass): void;
  /** ICG is a toggle, not a pointer tool. */
  toggleIcg(): void;
}

/**
 * Owns the instruments: selection (keys 1-0, Esc), pointer routing, picking,
 * cursor placement/orientation, hover classification and per-frame updates.
 */
export class ToolManager {
  readonly tools = new Map<ToolId, Tool>();
  active: Tool | null = null;
  hit: PickHit | null = null;

  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2(9, 9);
  private pressed = false;
  private lastPx = new THREE.Vector2();
  private cursorRoot = new THREE.Group();
  private tip = new THREE.Vector3();
  private prevTip = new THREE.Vector3();
  private tipSpeed = 0;
  private pickRoots: THREE.Object3D[];
  private warnedStress = false;
  /** While demo mode drives the pointer, real mouse movement is ignored (a click takes over). */
  ignoreTrustedMoves = false;

  constructor(private ctx: ToolContext, private dom: HTMLElement, private hooks: ToolManagerHooks) {
    const list: Tool[] = [
      new SuctionTool(ctx),
      new ScissorsTool(ctx),
      new BipolarTool(ctx),
      new DissectorTool(ctx),
      new SpatulaTool(ctx),
      new ClipTool(ctx),
      new DopplerTool(ctx),
      new EndoscopeTool(ctx),
      new TempClipTool(ctx),
    ];
    for (const t of list) {
      this.tools.set(t.id, t);
      t.cursor.visible = false;
      this.cursorRoot.add(t.cursor);
    }
    ctx.scene.add(this.cursorRoot);
    this.pickRoots = [ctx.anatomy.root, ctx.adhesions.group, ctx.placed, ctx.blood.group];
    this.bind();
  }

  get endoscope(): EndoscopeTool {
    return this.tools.get('endoscope') as EndoscopeTool;
  }
  get clip(): ClipTool {
    return this.tools.get('clip') as ClipTool;
  }

  setTool(id: ToolId | null): void {
    if (id === 'icg') {
      this.hooks.toggleIcg();
      return;
    }
    // Pressing 9 again while the scope is parked withdraws it.
    if (id === 'endoscope' && this.active?.id === 'endoscope' && state.endoscopeParked) {
      this.endoscope.withdraw();
      toast('toast.scopeWithdrawn', 'info', 0.5);
      return;
    }
    if (this.active?.id === id) id = null; // pressing the same key again puts it down
    if (this.active) {
      this.active.onUp();
      this.active.deactivate();
      this.active.cursor.visible = false;
    }
    this.pressed = false;
    this.active = id ? this.tools.get(id)! : null;
    this.active?.activate();
    this.ctx.scope.leftDragOrbits = !this.active;
    state.tool = this.active?.id ?? null;
    this.dom.style.cursor = this.active ? 'none' : '';
    bus.emit('tool:changed', { tool: state.tool });
  }

  private bind(): void {
    const el = this.dom;
    el.addEventListener('pointermove', (e) => {
      if (this.ignoreTrustedMoves && e.isTrusted) return;
      this.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      if (this.pressed && this.active) this.active.onDrag(this.hit, e.clientX - this.lastPx.x, e.clientY - this.lastPx.y);
      this.lastPx.set(e.clientX, e.clientY);
    });
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !this.active) return;
      this.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      this.pressed = true;
      this.lastPx.set(e.clientX, e.clientY);
      this.pick();
      this.active.onDown(this.hit);
    });
    const up = (e: PointerEvent) => {
      if (e.button !== 0 || !this.pressed) return;
      this.pressed = false;
      this.active?.onUp();
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', () => this.ndc.set(9, 9));

    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (this.active?.onKey(e)) {
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') return this.setTool(null);
      if (/^[0-9]$/.test(e.key)) {
        const idx = e.key === '0' ? 9 : Number(e.key) - 1;
        this.setTool(TOOL_ORDER[idx]);
      }
    });
  }

  /** Wheel goes to the active tool first (clip depth); returns true if consumed. */
  wheel(e: WheelEvent): boolean {
    return !!this.active?.onWheel(e);
  }

  /** Pick what lies under a screen position without moving the pointer. */
  probe(clientX: number, clientY: number): PickHit | null {
    const saved = this.ndc.clone(), savedHit = this.hit;
    this.ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.pick();
    const h = this.hit;
    this.ndc.copy(saved);
    this.hit = savedHit;
    return h;
  }

  get isPressed(): boolean {
    return this.pressed;
  }

  private pick(): void {
    if (Math.abs(this.ndc.x) > 1 || Math.abs(this.ndc.y) > 1) {
      this.hit = null;
      return;
    }
    this.raycaster.setFromCamera(this.ndc, this.ctx.scope.camera);
    const hits = this.raycaster.intersectObjects(this.pickRoots, true);
    const seeMembranes = !this.active || this.active.seesMembranes;
    for (const h of hits) {
      const o = h.object;
      const ud = o.userData;
      if (!ud.kind || ud.cut || !visibleChain(o)) continue;
      if (ud.kind === 'arachnoid' && !seeMembranes) continue;
      const normal = h.face ? h.face.normal.clone().transformDirection(o.matrixWorld) : new THREE.Vector3(0, 1, 0);
      this.hit = { object: o, point: h.point.clone(), normal, kind: ud.kind, id: ud.id };
      return;
    }
    this.hit = null;
  }

  update(dt: number): void {
    this.pick();
    const tool = this.active;

    // Retraction pressure accumulates beyond the safe range; the brain blanches.
    const safe = ANATOMY.fissure.safeRetraction;
    const over = Math.max(0, this.ctx.anatomy.retraction - safe) / (1 - safe);
    if (over > 0) {
      state.retractionStress += over * dt;
      if (!this.warnedStress && state.retractionStress > 1.5) {
        this.warnedStress = true;
        toast('toast.retractionStress', 'warn', 0);
      }
    } else this.warnedStress = false;
    this.ctx.anatomy.setBlanching(over);

    if (!tool) {
      this.hooks.highlight([], null);
      return;
    }
    // Tip follows the surface under the pointer.
    if (this.hit) this.tip.copy(this.hit.point).addScaledVector(this.hit.normal, 0.12);
    const inst = dt > 0 ? this.tip.distanceTo(this.prevTip) / dt : 0;
    this.tipSpeed += (inst - this.tipSpeed) * Math.min(1, dt * 12);
    this.prevTip.copy(this.tip);

    this.orientCursor(tool);
    tool.cursor.visible = !!this.hit || tool.cursor.visible;
    tool.update(dt, this.hit, this.pressed, this.tipSpeed);

    const cls = tool.classify(this.hit);
    if (cls && this.hit) {
      const owner = ownerOf(this.hit.object);
      this.hooks.highlight([owner], cls);
    } else this.hooks.highlight([], null);
  }

  /** Shaft from the tip back toward the microscope and the surgeon's hand. */
  private orientCursor(tool: Tool): void {
    const cam = this.ctx.scope.camera;
    const toCam = cam.position.clone().sub(this.tip).normalize();
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const side = tool.hand === 'right' ? 0.38 : -0.38;
    const y = toCam.multiplyScalar(1).addScaledVector(up, -0.55).addScaledVector(right, side).normalize();
    const viewDir = cam.position.clone().sub(this.tip).normalize();
    const x = new THREE.Vector3().crossVectors(y, viewDir).normalize();
    const z = new THREE.Vector3().crossVectors(x, y).normalize();
    tool.cursor.position.copy(this.tip);
    tool.cursor.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  }
}

function visibleChain(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
