import * as THREE from 'three';
import type { Anatomy } from '../anatomy';
import type { Adhesions } from '../anatomy/adhesions';
import { SIM } from '../config/sim';
import { bus } from '../core/events';
import { state } from '../core/store';
import type { EndoscopeView } from '../scene/endoscopeView';
import type { MicroscopeCamera } from '../scene/microscope';
import { evaluateClip } from './clipEval';
import type { StageManager } from './manager';
import type { ToolManager } from '../tools/manager';
import type { PickHit, ToolId } from '../tools/types';

export interface DemoContext {
  anatomy: Anatomy;
  adhesions: Adhesions;
  scope: MicroscopeCamera;
  tools: ToolManager;
  stages: StageManager;
  endoView: EndoscopeView;
  canvas: HTMLCanvasElement;
}

class Aborted extends Error {}

type Target = THREE.Vector3 | (() => THREE.Vector3);

/**
 * DEMO MODE. Plays each remaining stage automatically through the SAME tool
 * code a learner uses: it selects instruments and drives a virtual pointer
 * (synthetic pointer events on the canvas). Any real click or key press takes
 * over; "Resume demo" continues from the current stage.
 */
export class DemoDirector {
  running = false;
  paused = false;
  private token = 0;
  private frameWaiters: (() => void)[] = [];
  private px = new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2);
  private onChange = new Set<() => void>();

  constructor(private c: DemoContext) {
    // Real input takes over.
    const takeover = (e: Event) => {
      if (e.isTrusted && this.running && !this.paused) this.pause();
    };
    c.canvas.addEventListener('pointerdown', takeover, true);
    c.canvas.addEventListener('wheel', takeover, true);
    window.addEventListener('keydown', takeover, true);
  }

  subscribe(fn: () => void): void {
    this.onChange.add(fn);
  }
  private changed(): void {
    this.onChange.forEach((f) => f());
  }

  start(): void {
    this.running = true;
    this.paused = false;
    this.c.tools.ignoreTrustedMoves = true;
    this.changed();
    void this.run(++this.token);
  }

  pause(): void {
    this.token++;
    this.paused = true;
    this.c.tools.ignoreTrustedMoves = false;
    if (this.c.tools.isPressed) this.ev('pointerup');
    bus.emit('toast', { key: 'demo.takenOver', level: 'info' });
    this.changed();
  }

  stop(): void {
    this.token++;
    this.running = false;
    this.paused = false;
    this.c.tools.ignoreTrustedMoves = false;
    if (this.c.tools.isPressed) this.ev('pointerup');
    this.changed();
  }

  /** Called every frame from the main loop. */
  update(): void {
    const w = this.frameWaiters;
    this.frameWaiters = [];
    w.forEach((r) => r());
  }

  // ------------------------------------------------------------------ helpers
  private check(tok: number): void {
    if (tok !== this.token) throw new Aborted();
  }
  private frame(tok: number): Promise<void> {
    return new Promise<void>((r) => this.frameWaiters.push(r)).then(() => this.check(tok));
  }
  private async wait(tok: number, sec: number): Promise<void> {
    const end = performance.now() + sec * 1000;
    while (performance.now() < end) await this.frame(tok);
  }
  private toScreen(v: THREE.Vector3): THREE.Vector2 {
    const p = v.clone().project(this.c.scope.camera);
    return new THREE.Vector2(((p.x + 1) / 2) * window.innerWidth, ((1 - p.y) / 2) * window.innerHeight);
  }
  private ev(type: string): void {
    this.c.canvas.dispatchEvent(new PointerEvent(type, { clientX: this.px.x, clientY: this.px.y, button: 0, bubbles: true }));
  }
  private resolve(t: Target): THREE.Vector3 {
    return typeof t === 'function' ? t() : t;
  }
  /** Glide the virtual pointer to a world point (tracked while the camera moves). */
  private async moveTo(tok: number, target: Target, sec = 0.5): Promise<void> {
    const from = this.px.clone();
    const t0 = performance.now();
    for (;;) {
      const k = Math.min(1, (performance.now() - t0) / (sec * 1000));
      const e = k * k * (3 - 2 * k);
      const to = this.toScreen(this.resolve(target));
      this.px.lerpVectors(from, to, e);
      this.ev('pointermove');
      await this.frame(tok);
      if (k >= 1) return;
    }
  }
  private async click(tok: number, target: Target, hold = 0.08): Promise<void> {
    await this.moveTo(tok, target);
    this.ev('pointerdown');
    await this.wait(tok, hold);
    this.ev('pointerup');
    await this.wait(tok, 0.25);
  }
  /** Press, drag through world points, release. */
  private async stroke(tok: number, pts: THREE.Vector3[], sec: number): Promise<void> {
    await this.moveTo(tok, pts[0], 0.35);
    this.ev('pointerdown');
    for (let i = 1; i < pts.length; i++) await this.moveTo(tok, pts[i], sec / (pts.length - 1));
    this.ev('pointerup');
    await this.wait(tok, 0.15);
  }
  private tool(id: ToolId | null): void {
    if (state.tool !== id) this.c.tools.setTool(id);
  }
  private async focus(tok: number, p: THREE.Vector3, mag: number, tiltDeg?: number, azDeg?: number): Promise<void> {
    const s = this.c.scope;
    s.focusOn(p);
    s.mag = mag;
    if (tiltDeg !== undefined) s.tilt = (tiltDeg * Math.PI) / 180;
    if (azDeg !== undefined) s.azimuth = (azDeg * Math.PI) / 180;
    await this.wait(tok, 0.9);
  }
  /** First candidate point whose screen position actually picks the wanted structure. */
  private visible(cands: THREE.Vector3[], ok: (h: PickHit) => boolean): THREE.Vector3 | null {
    for (const p of cands) {
      const s = this.toScreen(p);
      if (s.x < 40 || s.y < 40 || s.x > window.innerWidth - 40 || s.y > window.innerHeight - 40) continue;
      const h = this.c.tools.probe(s.x, s.y);
      if (h && ok(h)) return h.point.clone();
    }
    return null;
  }
  private meshPoints(m: THREE.Mesh, n = 40): THREE.Vector3[] {
    const pos = m.geometry.attributes.position as THREE.BufferAttribute;
    m.updateMatrixWorld(true);
    const out: THREE.Vector3[] = [];
    const step = Math.max(1, Math.floor(pos.count / n));
    for (let i = 0; i < pos.count; i += step) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
    return out;
  }
  private curvePoints(id: string, t0: number, t1: number, n = 12): THREE.Vector3[] {
    const v = this.c.anatomy.vessels.get(id)!;
    return Array.from({ length: n }, (_, i) => v.curve.getPointAt(t0 + ((t1 - t0) * i) / (n - 1)));
  }
  /** Touch a structure with the active instrument (identifies it). */
  private async touch(tok: number, id: string, cands: THREE.Vector3[]): Promise<boolean> {
    if (state.identified.has(id)) return true;
    const p = this.visible(cands, (h) => h.id === id);
    if (!p) return false;
    await this.click(tok, p, 0.35);
    return state.identified.has(id);
  }
  private async cutCistern(tok: number, id: string): Promise<void> {
    const seg = this.c.anatomy.arachnoid.byId.get(`cistern-${id}`);
    if (!seg || seg.cut) return;
    this.tool('scissors');
    const p = this.visible(this.meshPoints(seg.mesh, 60), (h) => h.id === seg.id);
    if (p) await this.click(tok, p);
  }

  // ------------------------------------------------------------------ script
  private async run(tok: number): Promise<void> {
    try {
      while (!this.c.stages.complete) {
        const idx = this.c.stages.index;
        await this.stage(tok, this.c.stages.current.id);
        await this.wait(tok, 0.6);
        if (this.c.stages.index === idx && !this.c.stages.complete) {
          // Stage not finished by its script: retry once, then stop gracefully.
          await this.stage(tok, this.c.stages.current.id);
          await this.wait(tok, 0.6);
          if (this.c.stages.index === idx && !this.c.stages.complete) break;
        }
      }
      this.tool(null);
      bus.emit('toast', { key: this.c.stages.complete ? 'demo.done' : 'demo.stuck', level: this.c.stages.complete ? 'ok' : 'warn' });
      this.stop();
    } catch (e) {
      if (!(e instanceof Aborted)) throw e;
    }
  }

  private async stage(tok: number, id: string): Promise<void> {
    const an = this.c.anatomy;
    switch (id) {
      case 'fissure': {
        await this.focus(tok, new THREE.Vector3(10, 2, 1), 4.5, 22, 10);
        this.tool('scissors');
        for (const seg of an.arachnoid.fissureSegments) {
          if (seg.cut) continue;
          const p = this.visible(this.meshPoints(seg.mesh, 60).reverse(), (h) => h.id === seg.id);
          if (p) await this.click(tok, p);
        }
        await this.wait(tok, 0.4);
        this.tool('spatula');
        const start = new THREE.Vector3(6, 6, 8);
        await this.moveTo(tok, start, 0.4);
        this.ev('pointerdown');
        while (an.retraction < 0.62 && an.retraction < an.retractionLimit - 0.01) {
          this.px.y -= 4;
          this.ev('pointermove');
          await this.frame(tok);
        }
        this.ev('pointerup');
        await this.wait(tok, 0.4);
        break;
      }
      case 'm1': {
        await this.focus(tok, an.vessels.get('m1')!.curve.getPointAt(0.4), 6);
        await this.cutCistern(tok, 'proxSylvian');
        this.tool('dissector');
        await this.touch(tok, 'm1', this.curvePoints('m1', 0.1, 0.95));
        break;
      }
      case 'ica': {
        await this.focus(tok, an.vessels.get('ica')!.curve.getPointAt(0.4), 6);
        await this.cutCistern(tok, 'carotid');
        this.tool('dissector');
        await this.touch(tok, 'ica', this.curvePoints('ica', 0.05, 0.9));
        await this.touch(tok, 'optic', this.meshPoints(an.nerves.get('optic')!, 80));
        break;
      }
      case 'neck': {
        await this.focus(tok, an.aneurysm.neckCenter, 7);
        await this.cutCistern(tok, 'icpc');
        this.tool('dissector');
        await this.touch(tok, 'pcom', this.curvePoints('pcom', 0.05, 0.9, 16));
        if (!state.identified.has('acha') || !state.identified.has('pcom')) await this.parkEndoscope(tok, 'acha');
        await this.dissectNeck(tok);
        break;
      }
      case 'clip': {
        await this.focus(tok, an.aneurysm.neckCenter, 8);
        // Proximal control first, as a teaching example.
        if (!state.tempClip.on) {
          this.tool('tempClip');
          const p = this.visible(this.curvePoints('ica', 0.08, 0.4), (h) => h.id === 'ica');
          if (p) await this.click(tok, p);
          await this.wait(tok, 0.8);
        }
        await this.applyBestClip(tok);
        await this.wait(tok, 1);
        break;
      }
      case 'patency': {
        await this.focus(tok, an.aneurysm.neckCenter, 7);
        if (state.tempClip.on) await this.removeTempClip(tok);
        // ICG: watch the arterial phase, then switch it off.
        this.tool('icg');
        await this.wait(tok, 3.5);
        this.tool('icg');
        await this.wait(tok, 0.4);
        // Doppler on the PCom: rest the probe for a moment.
        this.tool('doppler');
        const p = this.visible(this.curvePoints('pcom', 0.05, 0.9, 16), (h) => h.id === 'pcom');
        if (p) {
          await this.moveTo(tok, p, 0.6);
          await this.wait(tok, 1.5);
        }
        // Endoscope look behind the dome (re-park if the parked view does not show the neck).
        await this.wait(tok, 1.5);
        if (!this.c.stages.isDone(this.c.stages.current, 'endoscopeCheck')) await this.parkEndoscope(tok, 'neck');
        await this.wait(tok, 1.5);
        break;
      }
    }
  }

  /** Find a lens position beside the dome that sees the wanted target, then click to park. */
  private async parkEndoscope(tok: number, want: 'acha' | 'neck'): Promise<void> {
    const an = this.c.anatomy;
    this.tool('endoscope');
    const endo = this.c.tools.endoscope;
    const roots = [an.root];
    const goal = want === 'acha' ? an.vessels.get('acha')!.curve.getPointAt(0.2) : an.aneurysm.neckCenter;
    const center = this.toScreen(an.aneurysm.domeCenter);
    for (let r = 60; r <= 220; r += 40)
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const x = center.x + Math.cos(a) * r, y = center.y + Math.sin(a) * r;
        const h = this.c.tools.probe(x, y);
        if (!h || h.kind === 'dome' || h.kind === 'bleb') continue;
        const lens = h.point.clone().addScaledVector(h.normal, 1.2);
        this.c.endoView.setPose(lens, an.aneurysm.neckCenter);
        const tol = want === 'neck' ? an.aneurysm.neckRadius + 1.5 : 1.2;
        if (!this.c.endoView.sees(goal, roots, tol)) continue;
        await this.click(tok, h.point.clone());
        await this.wait(tok, 1.8);
        void endo;
        return;
      }
  }

  /** Microscope angles (tilt°, azimuth°) worth trying to see around the neck. */
  private static VIEWS: [number, number][] = [[22, 10], [30, 150], [35, 40], [30, 100]];

  /** Is the band's midpoint directly visible (the first thing under it is this band)? */
  private bandVisible(i: number): boolean {
    const band = this.c.adhesions.list[i];
    const s = this.toScreen(band.a.clone().lerp(band.b, 0.5));
    const h = this.c.tools.probe(s.x, s.y);
    return !!h && h.kind === 'adhesion' && h.object.userData.index === i;
  }

  /** Tilt the microscope until the band can be seen (as a surgeon changes angle). */
  private async viewBand(tok: number, i: number): Promise<boolean> {
    if (this.bandVisible(i)) return true;
    const sc = this.c.scope;
    for (const [tilt, az] of DemoDirector.VIEWS) {
      sc.tilt = (tilt * Math.PI) / 180;
      sc.azimuth = (az * Math.PI) / 180;
      await this.wait(tok, 0.7);
      this.c.anatomy.root.updateMatrixWorld(true);
      if (this.bandVisible(i)) return true;
    }
    return false;
  }

  /** Slow strokes along each remaining adhesion band until the neck is free. */
  private async dissectNeck(tok: number): Promise<void> {
    const ad = this.c.adhesions;
    this.c.scope.focusOn(this.c.anatomy.aneurysm.neckCenter);
    this.c.scope.mag = 8;
    this.tool('dissector');
    for (let pass = 0; pass < 3 && state.neckClearance < SIM.procedure.neckClearanceNeeded; pass++) {
      for (let i = 0; i < ad.list.length; i++) {
        const band = ad.list[i];
        if (band.broken || state.neckClearance >= SIM.procedure.neckClearanceNeeded) continue;
        if (!(await this.viewBand(tok, i))) continue;
        // Sweep from the anchor toward the neck, slowly, staying on the band.
        const pts = [0, 0.25, 0.5, 0.75, 1].map((k) => band.b.clone().lerp(band.a, k));
        await this.stroke(tok, pts, 1.1);
      }
    }
    // Back to the standard view for clipping.
    this.c.scope.tilt = (22 * Math.PI) / 180;
    this.c.scope.azimuth = (10 * Math.PI) / 180;
    await this.wait(tok, 0.6);
  }

  /** Search a clip pose that closes the neck while sparing the branches, then apply it. */
  private async applyBestClip(tok: number): Promise<void> {
    const an = this.c.anatomy;
    this.tool('clip');
    const clip = this.c.tools.clip;
    const g = new THREE.Group();
    const c = this.toScreen(an.aneurysm.neckCenter);
    let best: { score: number; hit: PickHit; pose: number[] } | null = null;
    for (let dx = -36; dx <= 48; dx += 12)
      for (let dy = -36; dy <= 36; dy += 12) {
        const hit = this.c.tools.probe(c.x + dx, c.y + dy);
        if (!hit || hit.kind === 'clip') continue;
        for (const roll of [-90, -75, -105]) for (const tilt of [-15, 0, 15]) for (const yaw of [-15, 0, 15]) for (const depth of [1, 2, 3]) {
          clip.roll = (roll * Math.PI) / 180;
          clip.tilt = (tilt * Math.PI) / 180;
          clip.yaw = (yaw * Math.PI) / 180;
          clip.depth = depth;
          clip.pose(hit, g);
          const r = evaluateClip({ group: g, variant: clip.variant, bladeLength: clip.bladeLength, tip: new THREE.Vector3(), hinge: new THREE.Vector3(), jaw: new THREE.Vector3() }, an);
          const score = r.coverage - r.icaStenosis * 2 - (1 - r.pcom) - (1 - r.acha) - r.residualNeckMm * 0.2 - Math.abs(tilt) * 0.001 - Math.abs(yaw) * 0.001;
          if (!best || score > best.score) best = { score, hit, pose: [roll, tilt, yaw, depth] };
        }
        await this.frame(tok); // keep the page responsive while searching
      }
    if (!best) return;
    const [roll, tilt, yaw, depth] = best.pose;
    clip.roll = (roll * Math.PI) / 180;
    clip.tilt = (tilt * Math.PI) / 180;
    clip.yaw = (yaw * Math.PI) / 180;
    clip.depth = depth;
    const target = best.hit.point.clone();
    await this.moveTo(tok, target, 0.8);
    await this.wait(tok, 1.0); // show the open clip around the neck
    this.ev('pointerdown');
    this.ev('pointerup');
    await this.wait(tok, 0.5);
  }

  private async removeTempClip(tok: number): Promise<void> {
    this.tool('tempClip');
    const placed = this.c.tools.clip['ctx'].placed as THREE.Group;
    let tc: THREE.Object3D | null = null;
    placed.traverse((o) => {
      if (!tc && (o as THREE.Mesh).isMesh && o.userData.kind === 'tempClip') tc = o;
    });
    if (!tc) return;
    const p = (tc as THREE.Object3D).getWorldPosition(new THREE.Vector3());
    const screen = this.toScreen(p);
    const h = this.c.tools.probe(screen.x, screen.y);
    if (h?.kind === 'tempClip') await this.click(tok, h.point.clone());
    if (state.tempClip.on) (this.c.tools.tools.get('tempClip') as unknown as { remove(): void }).remove();
    await this.wait(tok, 0.6);
  }
}
