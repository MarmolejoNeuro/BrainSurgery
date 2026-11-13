import type { Anatomy } from '../anatomy';
import { audio } from '../audio/engine';
import { SIM } from '../config/sim';
import { bus } from '../core/events';
import type { I18nKey } from '../core/i18n';
import { state, tempOcclusionSeconds } from '../core/store';
import { touchStructure } from '../tools/common';
import type { ClipCheck } from './clipCheck';
import { STAGES, type CheckCtx, type ProcedureFlags, type StageDef } from './stages';

export type StageStatus = 'locked' | 'active' | 'done';

/**
 * Runs the procedure: evaluates the active stage's sub-tasks, latches them
 * once met, unlocks the next stage, and picks a contextual mentor hint.
 */
export class StageManager {
  readonly stages = STAGES;
  index = 0;
  /** Latched sub-tasks, keyed "stageId.taskId". */
  readonly done = new Set<string>();
  readonly completedAt: number[] = [];
  complete = false;
  hint: I18nKey | null = null;

  private flags: ProcedureFlags = { icgAfterClip: false, endoscopeAfterClip: false, dopplerAfterClip: new Map() };
  private timer = 0;

  constructor(private anatomy: Anatomy, private clip: ClipCheck) {
    bus.on('icg:toggle', ({ on }) => {
      if (on && state.clipCount > 0 && !state.tempClip.on) this.flags.icgAfterClip = true;
    });
    bus.on('doppler:checked', ({ id, flow }) => {
      if (state.clipCount > 0) this.flags.dopplerAfterClip.set(id, flow);
    });
    bus.on('endoscope:sighted', ({ id }) => {
      if (id === 'acha' || id === 'pcom') {
        if (!state.identified.has(id)) bus.emit('toast', { key: id === 'acha' ? 'toast.endoAcha' : 'toast.endoPcom', level: 'ok' });
        touchStructure(id, 'endoscope');
      }
      if (id === 'neck' && state.clipCount > 0) this.flags.endoscopeAfterClip = true;
    });
    // Any change of clips means the checks must be repeated.
    const resetChecks = () => {
      this.flags.icgAfterClip = false;
      this.flags.dopplerAfterClip.clear();
      this.flags.endoscopeAfterClip = false;
      for (const t of STAGES[5].tasks) this.done.delete(`patency.${t.id}`);
    };
    bus.on('clip:applied', resetChecks);
    bus.on('clip:removed', resetChecks);
  }

  private get ctx(): CheckCtx {
    return { state, anatomy: this.anatomy, flags: this.flags, clip: this.clip };
  }

  get current(): StageDef {
    return this.stages[Math.min(this.index, this.stages.length - 1)];
  }

  status(i: number): StageStatus {
    if (i < this.index || (this.complete && i === this.index)) return 'done';
    return i === this.index ? 'active' : 'locked';
  }

  isDone(stage: StageDef, taskId: string): boolean {
    return this.done.has(`${stage.id}.${taskId}`);
  }

  /** Fraction of the active stage's sub-tasks done. */
  stageProgress(i = this.index): number {
    const s = this.stages[i];
    if (!s) return 1;
    if (this.status(i) === 'done') return 1;
    return s.tasks.filter((t) => this.isDone(s, t.id)).length / s.tasks.length;
  }

  /** Overall procedure progress 0..1. */
  get overallProgress(): number {
    if (this.complete) return 1;
    return (this.index + this.stageProgress()) / this.stages.length;
  }

  taskProgress(t: StageDef['tasks'][number]): [number, number] | null {
    return t.progress ? t.progress(this.ctx) : null;
  }

  update(dt: number): void {
    this.timer += dt;
    if (this.timer < 0.2) return;
    this.timer = 0;
    this.hint = this.pickHint();
    if (this.complete) return;

    const stage = this.current;
    const ctx = this.ctx;
    for (const t of stage.tasks) {
      const key = `${stage.id}.${t.id}`;
      if (!this.done.has(key) && t.check(ctx)) {
        this.done.add(key);
        bus.emit('subtask:done', { stage: this.index, id: t.id });
      }
    }
    if (stage.tasks.every((t) => this.done.has(`${stage.id}.${t.id}`))) {
      this.completedAt[this.index] = state.elapsed;
      bus.emit('stage:completed', { index: this.index });
      audio.chime();
      if (this.index === this.stages.length - 1) {
        this.complete = true;
        state.completedAt = state.elapsed;
        bus.emit('procedure:complete', {});
      } else {
        this.index++;
        state.stageIndex = this.index;
        bus.emit('stage:changed', { index: this.index });
      }
    }
  }

  /** One calm, contextual hint at a time, most urgent first. */
  private pickHint(): I18nKey | null {
    const s = this.current.id;
    if (state.arterialBleeding) return state.tempClip.on ? 'hint.mentor.ruptureTemp' : 'hint.mentor.rupture';
    if (state.vitals.alarms.includes('alarm.mepLow')) return 'hint.mentor.mepLow';
    if (state.vitals.alarms.includes('alarm.mapLow')) return 'hint.mentor.hypotension';
    if (state.oozing) return 'hint.mentor.ooze';
    if (state.ruptureRisk > 0.35) return 'hint.mentor.risk';
    if (state.tempClip.on && tempOcclusionSeconds() > 240) return 'hint.mentor.occlusionLong';
    if (this.anatomy.retraction > 0.85) return 'hint.mentor.relaxRetraction';
    if (s === 'fissure' && this.anatomy.retraction >= this.anatomy.retractionLimit - 0.02 && this.anatomy.retractionLimit < 1)
      return 'hint.mentor.cutFirst';
    if (state.clipCount > 0 && state.neckClearance < SIM.procedure.neckClearanceNeeded && !this.complete) return 'hint.mentor.clipEarly';
    if (s === 'neck' && !state.identified.has('acha') && state.identified.has('pcom')) return 'hint.mentor.useEndoscope';
    if (state.clipCount > 0 && !this.complete) {
      const rows = this.clip.rows();
      const bad = rows.find((r) => r.revealed && r.level !== 'ok');
      if (bad) return `hint.clip.${bad.item}` as I18nKey;
    }
    if (s === 'patency' && this.flags.dopplerAfterClip.get('pcom') === 0) return 'hint.mentor.pcomSilent';
    if (s === 'patency' && state.tempClip.on && !this.flags.icgAfterClip) return 'hint.mentor.removeTempFirst';
    if (s === 'patency' && state.tempClip.on && this.done.has('patency.icgCheck')) return 'hint.mentor.removeTemp';
    if (this.complete) return 'hint.mentor.complete';
    return null;
  }
}
