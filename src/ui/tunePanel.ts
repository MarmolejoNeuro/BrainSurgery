import { applyDom, type I18nKey } from '../core/i18n';
import { h } from './dom';

export interface TuneBindings {
  retraction: { get: () => number; set: (v: number) => void };
  heartRate: { get: () => number; set: (v: number) => void };
  arachnoid: { get: () => number; set: (v: number) => void };
  bloom: { get: () => number; set: (v: number) => void };
  light: { get: () => number; set: (v: number) => void };
  lobes: { get: () => boolean; set: (v: boolean) => void };
  dof: { get: () => boolean; set: (v: boolean) => void };
}

/** Developer/learner tuning panel (toggle with T). Live-edits view parameters. */
export class TunePanel {
  readonly el: HTMLElement;
  private debug = h('div.debug', {}, h('h4', { i18n: 'tune.debug' }));
  private readouts: { el: HTMLElement; fn: () => string }[] = [];

  /** Live read-only value (hidden simulation values, for tuning). */
  addReadout(key: I18nKey, fn: () => string): void {
    const v = h('span.v.mono');
    this.debug.append(h('div', {}, h('span', { i18n: key }), v));
    this.readouts.push({ el: v, fn });
    applyDom(this.debug);
  }

  refresh(): void {
    if (this.el.style.display === 'none') return;
    for (const r of this.readouts) r.el.textContent = r.fn();
  }

  constructor(parent: HTMLElement, b: TuneBindings) {
    const slider = (key: I18nKey, bind: { get: () => number; set: (v: number) => void }, min: number, max: number, step: number, fmt = (v: number) => v.toFixed(2)) => {
      const val = h('span.val.mono', {}, fmt(bind.get()));
      const input = h('input', { type: 'range', min, max, step, value: String(bind.get()) }) as HTMLInputElement;
      input.addEventListener('input', () => {
        bind.set(Number(input.value));
        val.textContent = fmt(Number(input.value));
      });
      return h('label', {}, h('span', { i18n: key }), val, input);
    };
    const check = (key: I18nKey, bind: { get: () => boolean; set: (v: boolean) => void }) => {
      const input = h('input', { type: 'checkbox', checked: bind.get() }) as HTMLInputElement;
      input.addEventListener('change', () => bind.set(input.checked));
      return h('label.check', {}, input, h('span', { i18n: key }));
    };
    this.el = h(
      'div.tune.panel',
      {},
      h('h4', { i18n: 'tune.title' }),
      slider('tune.retraction', b.retraction, 0, 1, 0.01),
      slider('tune.heartRate', b.heartRate, 40, 140, 1, (v) => v.toFixed(0)),
      slider('tune.arachnoid', b.arachnoid, 0, 1, 0.01),
      slider('tune.bloom', b.bloom, 0, 2, 0.01),
      slider('tune.light', b.light, 0.5, 8, 0.1, (v) => v.toFixed(1)),
      check('tune.lobes', b.lobes),
      check('tune.dof', b.dof),
      h('div.note', { i18n: 'tune.note' }),
      this.debug,
    );
    this.el.style.display = 'none';
    parent.append(this.el);
    applyDom(this.el);
  }

  toggle(): void {
    this.el.style.display = this.el.style.display === 'none' ? '' : 'none';
  }
}
