import { t } from '../core/i18n';
import { CURRENT_CASE } from '../config/cases';
import { bestRun, clearHistory, loadHistory, type RunRecord } from '../procedure/history';
import { h } from './dom';

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Recent runs of the current case (newest first): date, time, blood loss and
 * clip result, with the best run and the current run marked.
 */
export function historyTable(thisRunId?: number, rows = 6): HTMLElement {
  const runs = loadHistory().filter((r) => r.caseId === CURRENT_CASE);
  const box = h('div.history');
  if (!runs.length) {
    box.append(h('div.empty', {}, t('history.empty')));
    return box;
  }
  const best = bestRun(runs);
  const result = (r: RunRecord) =>
    r.ruptured ? `${t('debrief.rupture')}` : r.result === 'complete' ? t('history.clean') : r.result === 'incomplete' ? t('debrief.resultIncomplete') : t('debrief.resultNone');
  const recent = runs.slice(-rows).reverse();
  const table = h(
    'table',
    {},
    ...recent.map((r) =>
      h(
        `tr${r.id === thisRunId ? '.this' : ''}`,
        {},
        h('td.mono', {}, new Date(r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
        h('td.mono', {}, fmt(r.seconds)),
        h('td.mono', {}, `${Math.round(r.ebl)} ml`),
        h(`td.res.${r.ruptured ? 'bad' : r.result}`, {}, result(r)),
        h('td.tag', {}, r.id === thisRunId ? t('history.this') : r === best ? `★ ${t('history.best')}` : ''),
      ),
    ),
  );
  const clear = h('button.link', {
    onclick: () => {
      clearHistory();
      box.replaceWith(historyTable(thisRunId, rows));
    },
  }, t('history.clear'));
  box.append(table, clear);
  return box;
}
