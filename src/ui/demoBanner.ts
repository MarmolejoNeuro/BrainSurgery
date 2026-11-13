import { t } from '../core/i18n';
import type { DemoDirector } from '../procedure/demo';
import { h } from './dom';

/** Banner shown while demo mode runs or is paused (take over / resume / exit). */
export class DemoBanner {
  private el = h('div.demo-banner.panel');

  constructor(parent: HTMLElement, private demo: DemoDirector) {
    parent.append(this.el);
    demo.subscribe(() => this.render());
    this.render();
  }

  render(): void {
    const d = this.demo;
    this.el.style.display = d.running ? '' : 'none';
    if (!d.running) return;
    this.el.classList.toggle('paused', d.paused);
    this.el.replaceChildren(
      h('span.tag.mono', {}, 'DEMO'),
      h('span.msg', {}, t(d.paused ? 'demo.paused' : 'demo.playing')),
      d.paused ? h('button.ui-btn.primary', { onclick: () => d.start() }, t('demo.resume')) : h('span'),
      h('button.ui-btn', { onclick: () => d.stop() }, t('demo.exit')),
    );
  }
}
