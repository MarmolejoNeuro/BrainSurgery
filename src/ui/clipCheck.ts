import { t, type I18nKey } from '../core/i18n';
import { state } from '../core/store';
import type { ClipCheck } from '../procedure/clipCheck';
import { h } from './dom';

/** Left panel listing clip findings as the learner verifies them. */
export class ClipCheckPanel {
  private el = h('div.clipcheck.panel');
  private sig = '';

  constructor(parent: HTMLElement, private check: ClipCheck) {
    parent.append(this.el);
    this.el.style.display = 'none';
  }

  render(force = false): void {
    const show = state.clipCount > 0;
    this.el.style.display = show ? '' : 'none';
    if (!show) return;
    const rows = this.check.rows();
    const sig = JSON.stringify([rows, t('check.title')]);
    if (!force && sig === this.sig) return;
    this.sig = sig;
    const evidence = (e: string | null) => (e ? t(`check.ev.${e}` as I18nKey) : '');
    this.el.replaceChildren(
      h('h4', {}, t('check.title')),
      ...rows.map((r) =>
        h(
          `div.crow.${r.revealed ? r.level : 'unknown'}`,
          {},
          h('span.citem', {}, t(`check.item.${r.item}` as I18nKey)),
          h(
            'span.cval',
            {},
            r.revealed ? t(r.text).replace('{v}', r.value ?? '') : t('check.unknown'),
          ),
          h('span.cev.mono', {}, evidence(r.evidence)),
        ),
      ),
      this.check.allRevealed
        ? h(`div.csum.${this.check.ideal ? 'ok' : 'warn'}`, {}, t(this.check.ideal ? 'check.ideal' : 'check.adjust'))
        : h('div.csum.hint', {}, t('check.howTo')),
    );
  }
}
