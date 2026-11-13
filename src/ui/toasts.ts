import { bus } from '../core/events';
import { t } from '../core/i18n';
import { h } from './dom';

/** Short feedback messages stacked above the toolbar. */
export function createToasts(parent: HTMLElement): void {
  const wrap = h('div.toasts');
  parent.append(wrap);
  bus.on('toast', ({ key, level = 'info' }) => {
    const el = h(`div.toast.panel.${level}`, {}, t(key));
    wrap.append(el);
    while (wrap.children.length > 4) wrap.firstElementChild?.remove();
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3100);
  });
}
