import { applyDom, getLang, toggleLang, onLangChange } from '../core/i18n';
import { h } from './dom';

/** Start screen with the educational-use disclaimer and language toggle. */
export function createStartScreen(parent: HTMLElement, onStart: (demo: boolean) => void): HTMLElement {
  const langBtn = h('button.ui-btn', { onclick: () => toggleLang() });
  const setLangLabel = () => (langBtn.textContent = getLang() === 'en' ? 'English · Español' : 'Español · English');
  setLangLabel();
  onLangChange(setLangLabel);

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
      h('div.case', { i18n: 'start.case' }),
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
