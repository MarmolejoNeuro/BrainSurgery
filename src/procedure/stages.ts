import type { Anatomy } from '../anatomy';
import { SIM } from '../config/sim';
import type { I18nKey } from '../core/i18n';
import type { SimState } from '../core/store';
import type { ToolId } from '../tools/types';
import type { ClipCheck } from './clipCheck';

/** What the stage checks can look at. */
export interface CheckCtx {
  state: SimState;
  anatomy: Anatomy;
  flags: ProcedureFlags;
  clip: ClipCheck;
}

/** Facts that only count when they happen in the right order (e.g. "after clipping"). */
export interface ProcedureFlags {
  icgAfterClip: boolean;
  /** The endoscope inspected the neck after the last clip was applied. */
  endoscopeAfterClip: boolean;
  /** Vessel ids checked with Doppler after the last clip, with the flow heard. */
  dopplerAfterClip: Map<string, number>;
}

export interface SubTask {
  id: string;
  label: I18nKey;
  check: (c: CheckCtx) => boolean;
  /** Optional numeric progress shown next to the label, e.g. 4/6. */
  progress?: (c: CheckCtx) => [number, number];
  /** Show progress as a percentage of the goal instead of "n/total". */
  percent?: boolean;
}

export interface StageDef {
  id: string;
  title: I18nKey;
  /** Calm, short instruction for the mentor panel. */
  instruction: I18nKey;
  /** Instruments that fit this step (shown as suggestions). */
  tools: ToolId[];
  tasks: SubTask[];
}

const FISSURE_CUTS_NEEDED = 6;
const RETRACTION_NEEDED = 0.5;
const NECK_CLEARANCE_NEEDED = SIM.procedure.neckClearanceNeeded;

const cut = (c: CheckCtx, id: string) => c.state.arachnoidCut.has(id);
const known = (c: CheckCtx, id: string) => c.state.identified.has(id);
const fissureCuts = (c: CheckCtx) => [...c.state.arachnoidCut].filter((s) => s.startsWith('fissure-')).length;

/**
 * The six steps of a pterional transsylvian IC-PC clipping, in order.
 * A stage unlocks when every sub-task of the previous one is met.
 */
export const STAGES: StageDef[] = [
  {
    // Split the fissure on its frontal side of the superficial sylvian vein,
    // cutting arachnoid sharply; CSF release relaxes the brain.
    id: 'fissure',
    title: 'stage.fissure.title',
    instruction: 'stage.fissure.text',
    tools: ['scissors', 'spatula'],
    tasks: [
      {
        id: 'cutArachnoid',
        label: 'task.cutArachnoid',
        check: (c) => fissureCuts(c) >= FISSURE_CUTS_NEEDED,
        progress: (c) => [Math.min(fissureCuts(c), FISSURE_CUTS_NEEDED), FISSURE_CUTS_NEEDED],
      },
      {
        id: 'retract',
        label: 'task.retract',
        percent: true,
        check: (c) => c.anatomy.retraction >= RETRACTION_NEEDED,
        progress: (c) => [Math.round(Math.min(c.anatomy.retraction / RETRACTION_NEEDED, 1) * 100), 100],
      },
    ],
  },
  {
    // Following the fissure deep leads to the M1 segment: the "road" to the ICA.
    id: 'm1',
    title: 'stage.m1.title',
    instruction: 'stage.m1.text',
    tools: ['scissors', 'dissector', 'doppler'],
    tasks: [
      { id: 'openProxSylvian', label: 'task.openProxSylvian', check: (c) => cut(c, 'cistern-proxSylvian') },
      { id: 'identifyM1', label: 'task.identifyM1', check: (c) => known(c, 'm1') },
    ],
  },
  {
    // Tracing M1 proximally reaches the ICA bifurcation and the ICA; the optic
    // nerve lies medial to it. Opening the carotid cistern releases more CSF.
    id: 'ica',
    title: 'stage.ica.title',
    instruction: 'stage.ica.text',
    tools: ['scissors', 'dissector'],
    tasks: [
      { id: 'openCarotid', label: 'task.openCarotid', check: (c) => cut(c, 'cistern-carotid') },
      { id: 'identifyICA', label: 'task.identifyICA', check: (c) => known(c, 'ica') },
      { id: 'identifyOptic', label: 'task.identifyOptic', check: (c) => known(c, 'optic') },
    ],
  },
  {
    // Before clipping, see the PCom and AChA origins and free the neck on both
    // sides so the blades can pass completely across it.
    id: 'neck',
    title: 'stage.neck.title',
    instruction: 'stage.neck.text',
    tools: ['scissors', 'dissector', 'doppler', 'endoscope'],
    tasks: [
      { id: 'openIcpc', label: 'task.openIcpc', check: (c) => cut(c, 'cistern-icpc') },
      { id: 'identifyPcom', label: 'task.identifyPcom', check: (c) => known(c, 'pcom') },
      { id: 'identifyAcha', label: 'task.identifyAcha', check: (c) => known(c, 'acha') },
      {
        id: 'freeNeck',
        label: 'task.freeNeck',
        percent: true,
        check: (c) => c.state.neckClearance >= NECK_CLEARANCE_NEEDED,
        progress: (c) => [Math.round(Math.min(c.state.neckClearance / NECK_CLEARANCE_NEEDED, 1) * 100), 100],
      },
    ],
  },
  {
    // Blades parallel to the ICA, across the whole neck, sparing the PCom and AChA.
    // A temporary clip on the proximal ICA softens the dome if needed.
    id: 'clip',
    title: 'stage.clip.title',
    instruction: 'stage.clip.text',
    tools: ['clip', 'tempClip'],
    tasks: [{ id: 'applyClip', label: 'task.applyClip', check: (c) => c.state.clipCount > 0 }],
  },
  {
    // Confirm with ICG and Doppler: dome dark/silent, PCom and AChA filling.
    id: 'patency',
    title: 'stage.patency.title',
    instruction: 'stage.patency.text',
    tools: ['icg', 'doppler', 'endoscope', 'tempClip'],
    tasks: [
      { id: 'icgCheck', label: 'task.icgCheck', check: (c) => c.flags.icgAfterClip },
      {
        id: 'domeExcluded',
        label: 'task.domeExcluded',
        check: (c) => c.clip.isRevealed('dome') && c.clip.rows()[0].level === 'ok',
      },
      { id: 'dopplerPcom', label: 'task.dopplerPcom', check: (c) => (c.flags.dopplerAfterClip.get('pcom') ?? 0) > 0.02 },
      { id: 'endoscopeCheck', label: 'task.endoscopeCheck', check: (c) => c.flags.endoscopeAfterClip },
      { id: 'tempOff', label: 'task.tempOff', check: (c) => !c.state.tempClip.on },
    ],
  },
];
