import type { ToolId } from '../tools/types';

/**
 * Central in-memory simulation state. Tools write to it, and later milestones
 * (stages, vitals, evaluation, debrief) read from it.
 */
export const state = {
  tool: null as ToolId | null,
  /** Index of the active procedure stage (0..5). */
  stageIndex: 0,
  elapsed: 0,

  /** Arachnoid segment ids that have been opened. */
  arachnoidCut: new Set<string>(),
  /** Structures the learner has touched/inspected (dissector or Doppler). */
  identified: new Set<string>(),

  /** Fraction (0..1) of neck adhesions freed by the dissector. */
  neckClearance: 0,
  /** HIDDEN 0..1 risk of intraoperative rupture; rises with rough dome handling. */
  ruptureRisk: 0,
  /** Accumulated over-retraction "pressure" (arbitrary units). */
  retractionStress: 0,

  tempClip: { on: false, startedAt: 0, totalSeconds: 0, episodes: 0 },

  /** Intraoperative rupture happened (and when, in elapsed seconds). */
  ruptured: false,
  ruptureTime: 0,
  /** Estimated blood loss (ml), cumulative. */
  ebl: 0,
  /** Blood currently in the field (ml). Suction removes it. */
  fieldBlood: 0,
  /** Current total bleeding rate (ml/s). */
  bleedRate: 0,
  /** An uncontrolled arterial (rupture) bleed is running. */
  arterialBleeding: false,
  /** At least one small/brisk bleeding point is active (bipolar target). */
  oozing: false,

  /** Live vital signs (written by the physiology model). */
  vitals: { hr: 68, sys: 124, dia: 74, map: 91, spo2: 99, mep: 100, minMep: 100, alarms: [] as string[] },
  clipCount: 0,
  /** Neck clearance when the first permanent clip went on (-1 = not yet). */
  clearanceAtFirstClip: -1,
  /** How many times a permanent clip was removed to reposition it. */
  clipRemovals: 0,
  /** The procedure has been completed (all six stages). */
  completedAt: -1,

  icgOn: false,
  endoscopeParked: false,

  /**
   * Relative flow 0..1 per vessel id, plus 'dome' for aneurysm filling.
   * Drives ICG brightness and Doppler; M5 computes it from clip geometry.
   */
  flow: {
    ica: 1, m1: 1, m2sup: 1, m2inf: 1, a1: 1, pcom: 1, acha: 1, dome: 1,
  } as Record<string, number>,
  /** Doppler pitch multiplier per vessel (>1 = narrowed, faster jet). */
  flowPitch: {} as Record<string, number>,
};

export type SimState = typeof state;

/** Current temporary occlusion time in seconds (0 when no temporary clip). */
export function tempOcclusionSeconds(): number {
  return state.tempClip.on ? state.elapsed - state.tempClip.startedAt : 0;
}
