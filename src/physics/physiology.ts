import { SIM } from '../config/sim';
import { state, tempOcclusionSeconds } from '../core/store';
import type { Heart } from './heart';

const P = SIM.physiology;

/** Ornstein-Uhlenbeck drift: wanders around 0 and keeps returning. */
class Drift {
  v = 0;
  constructor(private theta: number, private sigma: number) {}
  step(dt: number): number {
    const g = Math.sqrt(-2 * Math.log(Math.random() + 1e-9)) * Math.cos(2 * Math.PI * Math.random());
    this.v += -this.theta * this.v * dt + this.sigma * Math.sqrt(dt) * g;
    return this.v;
  }
}

/**
 * Simplified physiology for teaching:
 *  - Vitals drift gently around their baselines.
 *  - Blood loss: pressure falls and heart rate rises (hypovolemia); a brisk
 *    ongoing bleed adds an acute drop.
 *  - Motor evoked potentials (MEP) reflect motor-pathway perfusion: reduced
 *    distal ICA flow is tolerated for a few minutes thanks to collaterals; AChA
 *    occlusion (internal capsule, no collaterals) drops MEPs within ~1 minute.
 * All values are written to state.vitals.
 */
export class Physiology {
  baselineHR: number = SIM.heart.baselineHR;
  private dHR = new Drift(0.08, 1.2);
  private dBP = new Drift(0.05, 1.6);
  private dSat = new Drift(0.2, 0.35);
  private ischIca = 0;
  private ischAcha = 0;
  private sm = { hr: SIM.heart.baselineHR, map: 91, pp: 50, spo2: 99, mep: 100 };

  constructor(private heart: Heart) {}

  update(dt: number): void {
    const v = state.vitals;

    // --- Hemodynamics -------------------------------------------------------
    const loss = Math.min(state.ebl / P.severeLossMl, 1.2);
    const acute = Math.min(state.bleedRate * 2.2, 25); // ongoing brisk bleeding
    const baseMap = (P.baselineSys + 2 * P.baselineDia) / 3;
    const mapTarget = baseMap - 42 * loss - acute + this.dBP.step(dt);
    const hrTarget = this.baselineHR + 55 * loss + acute * 1.6 + this.dHR.step(dt);
    const ppTarget = (P.baselineSys - P.baselineDia) * (1 - 0.45 * Math.min(loss, 1));
    const satTarget = P.baselineSpO2 - 7 * Math.max(0, loss - 0.6) + this.dSat.step(dt) * 0.5;

    const k = 1 - Math.exp(-dt / 2.5); // baroreflex / measurement smoothing
    this.sm.map += (mapTarget - this.sm.map) * k;
    this.sm.hr += (hrTarget - this.sm.hr) * k;
    this.sm.pp += (ppTarget - this.sm.pp) * k;
    this.sm.spo2 += (satTarget - this.sm.spo2) * (1 - Math.exp(-dt / 6));

    // --- Motor evoked potentials ------------------------------------------
    const distal = Math.min(state.flow.m1 ?? 1, state.flow.ica ?? 1);
    if (distal < 0.5) this.ischIca += dt;
    else this.ischIca = Math.max(0, this.ischIca - dt * 0.5);
    if ((state.flow.acha ?? 1) < 0.3) this.ischAcha += dt;
    else this.ischAcha = Math.max(0, this.ischAcha - dt * 0.5);
    const mepTarget = Math.max(
      5,
      100 -
        Math.max(0, this.ischIca - P.icaIschemiaTolerance) * P.icaMepFallPerSec * 1.0 -
        Math.max(0, this.ischAcha - P.achaIschemiaTolerance) * P.achaMepFallPerSec -
        Math.max(0, 40 - this.sm.map) * 2, // profound hypotension
    );
    this.sm.mep += (mepTarget - this.sm.mep) * (1 - Math.exp(-dt / 4));

    v.hr = clamp(this.sm.hr, 30, 190);
    v.map = clamp(this.sm.map, 20, 160);
    v.sys = v.map + (2 * this.sm.pp) / 3;
    v.dia = v.map - this.sm.pp / 3;
    v.spo2 = clamp(this.sm.spo2, 70, 100);
    v.mep = clamp(this.sm.mep, 0, 100);
    v.minMep = Math.min(v.minMep, v.mep);
    this.heart.hr = v.hr;

    // --- Alarms ---------------------------------------------------------------
    const a: string[] = [];
    if (v.map < P.alarms.mapLow) a.push('alarm.mapLow');
    if (v.hr > P.alarms.hrHigh) a.push('alarm.hrHigh');
    if (v.spo2 < P.alarms.spo2Low) a.push('alarm.spo2Low');
    if (v.mep < P.alarms.mepLow) a.push('alarm.mepLow');
    if (tempOcclusionSeconds() > P.alarms.occlusionLong) a.push('alarm.occlusionLong');
    v.alarms = a;
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
