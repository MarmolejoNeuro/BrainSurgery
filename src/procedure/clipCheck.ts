import { bus } from '../core/events';
import type { I18nKey } from '../core/i18n';
import { state } from '../core/store';
import type { FlowModel } from '../physics/flow';

export type CheckItem = 'dome' | 'residual' | 'ica' | 'pcom' | 'acha';
export type Evidence = 'icg' | 'doppler' | 'endoscope';
export type Level = 'ok' | 'warn' | 'alarm';

export interface CheckRow {
  item: CheckItem;
  revealed: boolean;
  evidence: Evidence | null;
  level: Level;
  text: I18nKey;
  /** Number to show with the text (mm or %), if any. */
  value?: string;
}

/**
 * Evidence-gated clip assessment. The geometry is evaluated immediately, but
 * each finding is only REVEALED once the learner checks it the way a surgeon
 * would: ICG (all vessels, with the temporary clip off), the Doppler on a
 * specific vessel, or the endoscope behind the dome.
 */
export class ClipCheck {
  private evidence = new Map<CheckItem, Evidence>();

  constructor(private flow: FlowModel) {
    const reset = () => this.evidence.clear();
    bus.on('clip:applied', reset);
    bus.on('clip:removed', reset);
    bus.on('icg:toggle', ({ on }) => {
      if (!on || state.clipCount === 0) return;
      if (state.tempClip.on) {
        bus.emit('toast', { key: 'toast.icgTempOn', level: 'warn' });
        return;
      }
      for (const i of ['dome', 'residual', 'ica', 'pcom', 'acha'] as CheckItem[]) this.reveal(i, 'icg');
    });
    bus.on('doppler:checked', ({ id }) => {
      if (state.clipCount === 0) return;
      if (id === 'pcom' || id === 'acha' || id === 'ica') this.reveal(id, 'doppler');
      if (id === 'dome') this.reveal('dome', 'doppler');
    });
    bus.on('endoscope:sighted', ({ id }) => {
      if (state.clipCount === 0 || id !== 'neck') return;
      for (const i of ['dome', 'residual', 'acha'] as CheckItem[]) this.reveal(i, 'endoscope');
    });
  }

  private reveal(item: CheckItem, ev: Evidence): void {
    if (!this.evidence.has(item)) this.evidence.set(item, ev);
  }

  isRevealed(item: CheckItem): boolean {
    return this.evidence.has(item);
  }

  get allRevealed(): boolean {
    return this.evidence.size === 5;
  }

  rows(): CheckRow[] {
    const a = this.flow.assessment;
    const row = (item: CheckItem, level: Level, text: I18nKey, value?: string): CheckRow => ({
      item, revealed: this.evidence.has(item), evidence: this.evidence.get(item) ?? null, level, text, value,
    });
    const branch = (item: 'pcom' | 'acha', f: number) =>
      row(item, f >= 1 ? 'ok' : f > 0 ? 'warn' : 'alarm', f >= 1 ? 'check.branchOpen' : f > 0 ? 'check.branchKinked' : 'check.branchOccluded');
    const dome = a.domeFlow;
    const st = a.icaStenosis;
    return [
      row('dome', dome < 0.05 ? 'ok' : dome < 0.6 ? 'warn' : 'alarm', dome < 0.05 ? 'check.domeExcluded' : dome < 0.6 ? 'check.domePartial' : 'check.domeFills'),
      row('residual', a.residualNeckMm < 1 ? 'ok' : 'warn', a.residualNeckMm < 1 ? 'check.noResidual' : 'check.residual', a.residualNeckMm.toFixed(1)),
      row('ica', st < 0.3 ? 'ok' : st < 0.6 ? 'warn' : 'alarm', st < 0.3 ? 'check.icaOk' : 'check.icaNarrowed', `${Math.round(st * 100)}`),
      branch('pcom', a.pcom),
      branch('acha', a.acha),
    ];
  }

  /** True when every revealed finding is acceptable and all have been checked. */
  get ideal(): boolean {
    return this.allRevealed && this.rows().every((r) => r.level === 'ok');
  }
}
