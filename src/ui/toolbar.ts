import { bus } from '../core/events';
import { applyDom, t, type I18nKey } from '../core/i18n';
import { state } from '../core/store';
import { TOOL_ORDER, type ToolId } from '../tools/types';
import { h } from './dom';

/** Minimal line icons (24×24, stroke = currentColor). */
const ICONS: Record<ToolId, string> = {
  suction: '<path d="M5 20 L13 12 L19 6"/><path d="M19 6 l1.5 -1.5"/><circle cx="20.5" cy="3.5" r="1"/>',
  scissors: '<circle cx="6" cy="18" r="2.5"/><circle cx="12" cy="20" r="2.5"/><path d="M7.5 16 L19 4"/><path d="M12 17.5 L18 5"/>',
  bipolar: '<path d="M4 21 L17 4"/><path d="M8 21 L19 6"/><path d="M17 4 l2 2"/>',
  dissector: '<path d="M4 20 L16 8"/><path d="M16 8 q2 -1 3 -4"/><circle cx="19" cy="4" r="1.2"/>',
  spatula: '<rect x="13" y="3" width="6" height="9" rx="1.5" transform="rotate(35 16 7)"/><path d="M4 21 L13 11"/>',
  clip: '<path d="M7 21 L11 9 L12 3"/><path d="M15 21 L13 9 L12 3"/><circle cx="12" cy="17" r="2.2"/>',
  icg: '<path d="M3 12 h4 l2 -6 l4 12 l2 -6 h6"/>',
  doppler: '<path d="M4 20 L14 10"/><circle cx="15" cy="9" r="1.4"/><path d="M17 5 q3 3 0 6"/><path d="M19.5 3 q5 5 0 10"/>',
  endoscope: '<path d="M3 21 L16 8"/><path d="M15 6 l3 3 l3 -3 l-3 -3 z"/>',
  tempClip: '<path d="M8 21 L11 10 L12 4"/><path d="M14 21 L13 10 L12 4"/><path d="M5 11 h14" stroke-dasharray="2 2"/>',
};

/** Bottom toolbar with keys 1–0 and the hint line for the active instrument. */
export class Toolbar {
  private buttons = new Map<ToolId, HTMLButtonElement>();
  private hint = h('div.tool-hint.panel');
  private variantEl = h('span.variant.mono');

  constructor(parent: HTMLElement, onSelect: (id: ToolId) => void, getClipVariant: () => 'straight' | 'curved') {
    const bar = h('div.toolbar.panel');
    TOOL_ORDER.forEach((id, i) => {
      const key = i === 9 ? '0' : String(i + 1);
      const btn = h(
        'button.tool-btn',
        { title: '', onclick: () => onSelect(id) },
        h('span.key.mono', {}, key),
      ) as HTMLButtonElement;
      btn.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[id]}</svg>`);
      btn.append(h('span.name', { i18n: `tool.${id}` }));
      if (id === 'clip') btn.append(this.variantEl);
      this.buttons.set(id, btn);
      bar.append(btn);
    });
    parent.append(this.hint, bar);
    applyDom(bar);

    const refresh = () => {
      this.buttons.forEach((b, id) => {
        b.classList.toggle('active', state.tool === id || (id === 'icg' && state.icgOn));
        b.classList.toggle('parked', id === 'endoscope' && state.endoscopeParked);
        b.classList.toggle('on', id === 'tempClip' && state.tempClip.on);
      });
      this.variantEl.textContent = t(`hud.clipVariant.${getClipVariant()}` as I18nKey);
      this.hint.textContent = t(`hint.${state.tool ?? 'none'}` as I18nKey);
    };
    this.refresh = refresh;
    for (const ev of ['tool:changed', 'icg:toggle', 'endoscope:parked', 'tempclip:on', 'tempclip:off'] as const) bus.on(ev, refresh);
    window.addEventListener('keydown', (e) => e.key === 'Tab' && setTimeout(refresh));
    refresh();
  }

  refresh: () => void;
}
