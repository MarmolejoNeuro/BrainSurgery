import { t, type I18nKey } from '../core/i18n';
import type { StageManager } from '../procedure/manager';
import type { ToolId } from '../tools/types';
import { TOOL_ORDER } from '../tools/types';
import { h } from './dom';

/**
 * Mentor panel (bottom right): the current step in a few calm words,
 * sub-task checkboxes, stage and overall progress, a contextual hint and
 * suggested instruments. Collapsible.
 */
export class MentorPanel {
  private el = h('div.mentor.panel');
  private head = h('div.mentor-head');
  private body = h('div.mentor-body');
  private collapsed = false;
  private sig = '';

  constructor(parent: HTMLElement, private stages: StageManager, private selectTool: (id: ToolId) => void, private onFinish: () => void = () => {}) {
    this.el.append(this.head, this.body);
    this.head.addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      this.el.classList.toggle('collapsed', this.collapsed);
      this.render(true);
    });
    parent.append(this.el);
    this.render(true);
  }

  render(force = false): void {
    const sm = this.stages;
    const stage = sm.current;
    const tasks = stage.tasks.map((task) => {
      const p = sm.taskProgress(task);
      return { task, done: sm.isDone(stage, task.id) || sm.status(sm.index) === 'done', p };
    });
    const pct = Math.round(sm.stageProgress() * 100);
    const overall = Math.round(sm.overallProgress * 100);
    const sig = JSON.stringify([sm.index, sm.complete, pct, overall, sm.hint, tasks.map((x) => [x.done, x.p]), this.collapsed, t('mentor.title')]);
    if (!force && sig === this.sig) return;
    this.sig = sig;

    this.head.replaceChildren(
      h('span.mentor-title', {}, t('mentor.title')),
      h('span.mentor-stage', {}, sm.complete ? t('mentor.done') : `${sm.index + 1}/${sm.stages.length} · ${t(stage.title)}`),
      h('span.mentor-pct.mono', {}, `${overall}%`),
      h('span.mentor-toggle.mono', {}, this.collapsed ? '+' : '–'),
    );
    if (this.collapsed) {
      this.body.replaceChildren();
      return;
    }

    const bar = h('div.bar', {}, h('div.fill'));
    (bar.firstChild as HTMLElement).style.width = `${pct}%`;

    const list = h(
      'ul.tasks',
      {},
      ...tasks.map(({ task, done, p }) =>
        h(
          `li${done ? '.done' : ''}`,
          {},
          h('span.box', {}, done ? '✓' : ''),
          h('span.tlabel', {}, t(task.label)),
          p && !done ? h('span.tprog.mono', {}, task.percent ? `${p[0]}%` : `${p[0]}/${p[1]}`) : null,
        ),
      ),
    );

    const chips = h(
      'div.chips',
      {},
      h('span.k', {}, t('mentor.suggested')),
      ...stage.tools.map((id) => {
        const idx = TOOL_ORDER.indexOf(id);
        const key = idx === 9 ? '0' : String(idx + 1);
        return h('button.chip', { onclick: () => this.selectTool(id) }, h('span.mono', {}, key), ` ${t(`tool.${id}` as I18nKey)}`);
      }),
    );

    const parts: Node[] = [
      h('div.stage-row', {}, h('span', {}, t('mentor.stageProgress')), h('span.mono', {}, `${pct}%`)),
      bar,
      h('p.instruction', {}, sm.complete ? t('mentor.completeText') : t(stage.instruction)),
      list,
    ];
    if (sm.hint) parts.push(h('div.hint', {}, t(sm.hint)));
    if (!sm.complete) parts.push(chips);
    else parts.push(h('button.ui-btn.primary.finish', { onclick: () => this.onFinish() }, t('mentor.finish')));
    this.body.replaceChildren(...parts);
  }
}
