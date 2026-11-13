import type { Anatomy } from '../anatomy';
import { bus } from '../core/events';
import { state } from '../core/store';
import { assess, type Assessment } from '../procedure/clipEval';
import { placedClips } from '../tools/clip';

/** Flow reaching the distal ICA territory through the circle of Willis when the ICA is closed. */
const COLLATERAL = 0.18;
/** The PCom can also fill backwards from the posterior circulation. */
const PCOM_RETROGRADE = 0.5;

/**
 * Simple flow model. Recomputed whenever a clip or the temporary clip changes.
 * Writes relative flow (0..1) per vessel and Doppler pitch, which ICG,
 * Doppler, bleeding and MEPs all read. Also stores the clip assessment.
 */
export class FlowModel {
  assessment: Assessment;

  constructor(private anatomy: Anatomy) {
    this.assessment = assess([], anatomy);
    for (const ev of ['clip:applied', 'clip:removed', 'tempclip:on', 'tempclip:off'] as const) bus.on(ev, () => this.recompute());
  }

  recompute(): void {
    const a = (this.assessment = assess(placedClips, this.anatomy));
    // Proximal (temporary) ICA occlusion.
    const proximal = state.tempClip.on ? 0 : 1;
    // A clip narrowing the ICA: little effect until >50% diameter, then flow falls.
    const s = a.icaStenosis;
    const icaPass = s < 0.5 ? 1 : Math.max(0, 1 - Math.pow((s - 0.5) / 0.5, 1.5));
    const distal = Math.max(COLLATERAL, proximal * icaPass);
    const atNeck = Math.max(proximal === 0 ? COLLATERAL : 0, proximal);

    const f = state.flow;
    f.ica = Math.max(COLLATERAL, proximal * Math.max(icaPass, 0.05));
    f.m1 = distal;
    f.m2sup = distal;
    f.m2inf = distal;
    f.a1 = Math.max(distal, 0.6); // A1 also fills across the AComm
    f.dome = a.domeFlow * atNeck;
    f.pcom = a.pcom * Math.max(atNeck, PCOM_RETROGRADE);
    f.acha = a.acha * Math.max(atNeck, 0.1);

    // Narrowed vessels give a faster, higher-pitched Doppler jet.
    state.flowPitch.ica = 1 + 1.5 * Math.min(s, 0.8);
    state.flowPitch.pcom = a.pcom === 0.5 ? 1.6 : 1;
    state.flowPitch.acha = a.acha === 0.5 ? 1.6 : 1;
  }
}
