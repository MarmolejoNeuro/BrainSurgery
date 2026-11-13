import { SIM } from '../config/sim';
import type { I18nKey } from '../core/i18n';
import { state, tempOcclusionSeconds } from '../core/store';
import type { Assessment } from './clipEval';
import type { ClipCheck } from './clipCheck';
import type { StageManager } from './manager';

export interface Debrief {
  totalSeconds: number;
  ebl: number;
  occlusionSeconds: number;
  occlusionEpisodes: number;
  ruptured: boolean;
  ruptureAt: number;
  minMep: number;
  stagesDone: number;
  clipped: boolean;
  /** 'complete' | 'incomplete' | 'none' */
  clipResult: 'complete' | 'incomplete' | 'none';
  assessment: Assessment;
  verified: boolean;
  tips: { key: I18nKey; value?: string }[];
}

/**
 * Builds the end-of-case summary and a few specific, rule-based tips.
 * The clip findings here are the true geometry, even if not all were verified.
 */
export function buildDebrief(a: Assessment, check: ClipCheck, stages: StageManager): Debrief {
  const occl = state.tempClip.totalSeconds + tempOcclusionSeconds();
  const total = state.completedAt > 0 ? state.completedAt : state.elapsed;
  const goodClip = a.clipped && a.domeFlow < 0.05 && a.residualNeckMm < 1 && a.icaStenosis < 0.3 && a.pcom >= 1 && a.acha >= 1;
  const tips: Debrief['tips'] = [];
  const add = (key: I18nKey, value?: string) => tips.push({ key, value });

  if (!a.clipped) add('tip.notClipped');
  if (a.clipped && a.domeFlow >= 0.05) add('tip.clipDome');
  if (a.clipped && a.residualNeckMm >= 1) add('tip.clipResidual', a.residualNeckMm.toFixed(1));
  if (a.icaStenosis >= 0.3) add('tip.clipIca', `${Math.round(a.icaStenosis * 100)}`);
  if (a.pcom < 1 || a.acha < 1) add('tip.clipBranch');
  if (state.ruptured) add(state.tempClip.episodes > 0 ? 'tip.rupture' : 'tip.ruptureNoTemp');
  if (state.clearanceAtFirstClip >= 0 && state.clearanceAtFirstClip < SIM.procedure.neckClearanceNeeded)
    add('tip.dissectFirst', `${Math.round(state.clearanceAtFirstClip * 100)}`);
  if (occl > 600) add('tip.occlusionLong', `${Math.round(occl / 60)}`);
  else if (occl > 300) add('tip.occlusionModerate', `${Math.round(occl / 60)}`);
  if (state.vitals.minMep < 50) add('tip.mep', `${Math.round(state.vitals.minMep)}`);
  if (state.ebl > 300) add('tip.ebl', `${Math.round(state.ebl)}`);
  if (state.retractionStress > 1.5) add('tip.retraction');
  if (a.clipped && !check.allRevealed) add('tip.verify');
  if (state.clipRemovals >= 3) add('tip.repositions', `${state.clipRemovals}`);
  if (state.ruptureRisk > 0.3 && !state.ruptured) add('tip.domeHandling');
  if (!tips.length) add('tip.great');

  return {
    totalSeconds: total,
    ebl: state.ebl,
    occlusionSeconds: occl,
    occlusionEpisodes: state.tempClip.episodes,
    ruptured: state.ruptured,
    ruptureAt: state.ruptureTime,
    minMep: state.vitals.minMep,
    stagesDone: stages.complete ? stages.stages.length : stages.index,
    clipped: a.clipped,
    clipResult: !a.clipped ? 'none' : goodClip ? 'complete' : 'incomplete',
    assessment: a,
    verified: check.allRevealed,
    tips: tips.slice(0, 5),
  };
}
