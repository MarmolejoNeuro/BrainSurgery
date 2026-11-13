import { t, type I18nKey } from '../core/i18n';
import type { Debrief } from '../procedure/scoring';
import { h } from './dom';

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** End-of-case debrief overlay. */
export class DebriefScreen {
  private el = h('div.debrief');
  private last: (() => Debrief) | null = null;

  constructor(parent: HTMLElement) {
    this.el.style.display = 'none';
    parent.append(this.el);
  }

  get open(): boolean {
    return this.el.style.display !== 'none';
  }

  show(make: () => Debrief): void {
    this.last = make;
    this.render();
    this.el.style.display = '';
  }

  hide(): void {
    this.el.style.display = 'none';
  }

  /** Re-render (e.g. after a language change). */
  render(): void {
    if (!this.last) return;
    const d = this.last();
    const a = d.assessment;
    const stat = (k: I18nKey, v: string, cls = '') => h(`div.stat${cls}`, {}, h('span.k', {}, t(k)), h('span.v.mono', {}, v));
    const yes = (b: boolean) => t(b ? 'debrief.yes' : 'debrief.no');
    const branch = (f: number) => t(f >= 1 ? 'check.branchOpen' : f > 0 ? 'check.branchKinked' : 'check.branchOccluded');
    const resultKey: I18nKey = d.clipResult === 'complete' ? 'debrief.resultComplete' : d.clipResult === 'incomplete' ? 'debrief.resultIncomplete' : 'debrief.resultNone';

    const clipRows = d.clipped
      ? h(
          'div.cliprows',
          {},
          h('div', {}, h('span', {}, t('check.item.dome')), h('b', {}, a.domeFlow < 0.05 ? t('check.domeExcluded') : t('check.domeFills'))),
          h('div', {}, h('span', {}, t('check.item.residual')), h('b', {}, a.residualNeckMm < 1 ? t('check.noResidual') : t('check.residual').replace('{v}', a.residualNeckMm.toFixed(1)))),
          h('div', {}, h('span', {}, t('check.item.ica')), h('b', {}, a.icaStenosis < 0.3 ? t('check.icaOk') : t('check.icaNarrowed').replace('{v}', `${Math.round(a.icaStenosis * 100)}`))),
          h('div', {}, h('span', {}, t('check.item.pcom')), h('b', {}, branch(a.pcom))),
          h('div', {}, h('span', {}, t('check.item.acha')), h('b', {}, branch(a.acha))),
          h('div.note', {}, t(d.verified ? 'debrief.verified' : 'debrief.notVerified')),
        )
      : h('div.cliprows');

    const card = h(
      'div.card.panel',
      {},
      h('h1', {}, t('debrief.title')),
      h('div.sub', {}, t('app.subtitle')),
      h(
        'div.stats',
        {},
        stat('debrief.time', fmt(d.totalSeconds)),
        stat('debrief.ebl', `${Math.round(d.ebl)} ml`, d.ebl > 300 ? '.bad' : ''),
        stat('debrief.occlusion', d.occlusionEpisodes ? `${fmt(d.occlusionSeconds)} (${d.occlusionEpisodes}×)` : '—', d.occlusionSeconds > 600 ? '.bad' : ''),
        stat('debrief.rupture', d.ruptured ? `${yes(true)} · ${fmt(d.ruptureAt)}` : yes(false), d.ruptured ? '.bad' : '.good'),
        stat('debrief.minMep', `${Math.round(d.minMep)}%`, d.minMep < 50 ? '.bad' : ''),
        stat('debrief.stages', `${d.stagesDone}/6`),
      ),
      h('h3', {}, t('debrief.clip'), h(`span.result.${d.clipResult}`, {}, t(resultKey))),
      clipRows,
      h('h3', {}, t('debrief.tips')),
      h(
        'ul.tips',
        {},
        ...d.tips.map((tip) => h('li', {}, t(tip.key).replace('{v}', tip.value ?? ''))),
      ),
      h('div.disclaimer-small', {}, t('start.disclaimer')),
      h(
        'div.row',
        {},
        h('button.ui-btn', { onclick: () => this.hide() }, t('debrief.back')),
        h('button.ui-btn.primary', { onclick: () => location.reload() }, t('debrief.restart')),
      ),
    );
    this.el.replaceChildren(card);
  }
}
