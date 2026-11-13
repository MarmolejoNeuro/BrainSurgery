import { t } from '../core/i18n';
import type { StageManager } from '../procedure/manager';
import { h } from './dom';

/** Left checklist: the six stages with locked / active / done states. */
export class Checklist {
  private el = h('div.checklist.panel');
  private sig = '';

  constructor(parent: HTMLElement, private stages: StageManager) {
    parent.append(this.el);
    this.render(true);
  }

  render(force = false): void {
    const sm = this.stages;
    const sig = `${sm.index}|${sm.complete}|${Math.round(sm.stageProgress() * 100)}|${t('checklist.title')}`;
    if (!force && sig === this.sig) return;
    this.sig = sig;
    this.el.replaceChildren(
      h('h4', {}, t('checklist.title')),
      ...sm.stages.map((s, i) => {
        const st = sm.status(i);
        const mark = st === 'done' ? '✓' : st === 'active' ? '▸' : '·';
        const row = h(
          `div.stage.${st}`,
          {},
          h('span.num.mono', {}, String(i + 1)),
          h('span.label', {}, t(s.title)),
          h('span.mark.mono', {}, mark),
        );
        if (st === 'active') {
          const bar = h('div.mini-bar', {}, h('div.fill'));
          (bar.firstChild as HTMLElement).style.width = `${Math.round(sm.stageProgress(i) * 100)}%`;
          row.append(bar);
        }
        return row;
      }),
    );
  }
}
