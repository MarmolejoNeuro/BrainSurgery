import { applyDom, t, toggleLang, type I18nKey } from '../core/i18n';
import { h } from './dom';

/** Top bar (title, magnification, field, HR, language) and hover label. */
export class Hud {
  private magEl = h('span.v.mono');
  private fovEl = h('span.v.mono');
  private occlEl = h('span.v.mono');
  private occlWrap: HTMLElement;
  private hoverEl = h('div.hover-label.panel');
  private help: HTMLElement;
  private hoverKey: I18nKey | null = null;

  constructor(parent: HTMLElement, onTune: () => void, onDemo: () => void = () => {}, onEnd: () => void = () => {}) {
    const readout = (key: I18nKey, v: HTMLElement) => h('span.readout', {}, h('span.k', { i18n: key }), v);
    this.occlWrap = h('span.readout.occl', {}, h('span.k', { i18n: 'hud.occl' }), this.occlEl);
    this.occlWrap.style.display = 'none';
    const bar = h(
      'div.topbar.panel',
      {},
      h('span.title', { i18n: 'app.title' }),
      readout('hud.mag', this.magEl),
      readout('hud.fov', this.fovEl),
      h('span.milestone', { i18n: 'hud.milestone' }),
      h('button.ui-btn', { i18n: 'hud.help', onclick: () => this.toggleHelp() }),
      h('button.ui-btn', { i18n: 'hud.demo', onclick: onDemo }),
      h('button.ui-btn', { i18n: 'hud.end', onclick: onEnd }),
      h('button.ui-btn', { i18n: 'hud.tune', onclick: onTune }),
      h('button.ui-btn', { i18n: 'hud.lang', onclick: () => toggleLang() }),
    );
    this.help = h(
      'div.help.panel',
      {},
      h('h4', { i18n: 'start.controlsTitle' }),
      h('div', { i18n: 'start.ctlOrbit' }),
      h('div', { i18n: 'start.ctlPan' }),
      h('div', { i18n: 'start.ctlZoom' }),
      h('div', { i18n: 'start.ctlFocus' }),
      h('div', { i18n: 'start.ctlTools' }),
      h('div', { i18n: 'start.ctlTune' }),
    );
    this.help.style.display = 'none';
    this.hoverEl.style.opacity = '0';
    parent.append(bar, this.help, this.hoverEl);
    applyDom(bar);
    applyDom(this.help);
  }

  toggleHelp(): void {
    this.help.style.display = this.help.style.display === 'none' ? '' : 'none';
  }

  update(mag: number, field: number, hr: number, occlSeconds = 0): void {
    this.occlWrap.style.display = occlSeconds > 0 ? '' : 'none';
    if (occlSeconds > 0) this.occlEl.textContent = `${String(Math.floor(occlSeconds / 60)).padStart(2, '0')}:${String(Math.floor(occlSeconds % 60)).padStart(2, '0')}`;
    this.magEl.textContent = `×${mag.toFixed(1)}`;
    this.fovEl.textContent = `${field.toFixed(0)} mm`;
    void hr;
  }

  setHover(key: I18nKey | null): void {
    this.hoverKey = key;
    this.hoverEl.style.opacity = key ? '1' : '0';
    if (key) this.hoverEl.textContent = t(key);
  }

  refreshLang(): void {
    this.setHover(this.hoverKey);
  }
}
