import { applyDom, getLang, toggleLang, onLangChange, t } from '../core/i18n';
import { CASES, CURRENT_CASE, loadCase, type CaseId } from '../config/cases';
import { h } from './dom';
import { historyTable } from './historyTable';

/** Start screen with the educational-use disclaimer, case picker, run history and language toggle. */
export function createStartScreen(parent: HTMLElement, onStart: (demo: boolean) => void): HTMLElement {
  const langBtn = h('button.ui-btn', { onclick: () => toggleLang() });
  const setLangLabel = () => (langBtn.textContent = getLang() === 'en' ? 'English · Español' : 'Español · English');
  setLangLabel();

  // Case picker: choosing another case reloads the page with ?case=…
  const cases = h('div.cases');
  const history = h('div.history-wrap');
  const renderDynamic = () => {
    cases.replaceChildren(
      ...(Object.keys(CASES) as CaseId[]).map((id) =>
        h(
          `button.case-card${id === CURRENT_CASE ? '.selected' : ''}`,
          { onclick: () => id !== CURRENT_CASE && loadCase(id) },
          h('b', {}, t(CASES[id].title)),
          h('span', {}, t(CASES[id].description)),
        ),
      ),
    );
    history.replaceChildren(h('h4', {}, t('history.title')), historyTable(undefined, 3));
  };
  renderDynamic();
  onLangChange(() => {
    setLangLabel();
    renderDynamic();
  });

  const startBtn = h('button.ui-btn.primary', { i18n: 'start.begin' });
  const demoBtn = h('button.ui-btn', { i18n: 'start.demo' });
  const el = h(
    'div.start',
    {},
    h(
      'div.card.panel',
      {},
      h('h1', { i18n: 'app.title' }),
      h('div.sub', { i18n: 'app.subtitle' }),
      h('div.disclaimer', {}, h('strong', { i18n: 'start.disclaimerTitle' }), h('span', { i18n: 'start.disclaimer' })),
      h('h4', { i18n: 'start.caseTitle' }),
      cases,
      h('h4', { i18n: 'start.controlsTitle' }),
      h(
        'ul',
        {},
        h('li', { i18n: 'start.ctlOrbit' }),
        h('li', { i18n: 'start.ctlPan' }),
        h('li', { i18n: 'start.ctlZoom' }),
        h('li', { i18n: 'start.ctlFocus' }),
        h('li', { i18n: 'start.ctlTools' }),
        h('li', { i18n: 'start.ctlTune' }),
      ),
      history,
      h('div.row', {}, langBtn, h('div.btns', {}, demoBtn, startBtn)),
    ),
  );
  const go = (demo: boolean) => {
    el.classList.add('hidden');
    setTimeout(() => el.remove(), 700);
    onStart(demo);
  };
  startBtn.addEventListener('click', () => go(false));
  demoBtn.addEventListener('click', () => go(true));
  parent.append(el);
  applyDom(el);
  return el;
}
