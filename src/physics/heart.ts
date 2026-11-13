import { SIM } from '../config/sim';

/**
 * Minimal cardiac clock. Produces a normalized arterial pressure waveform
 * (sharp systolic upstroke, dicrotic notch, diastolic run-off) used to drive
 * vessel pulsation now and the ECG / arterial line in M4.
 */
export class Heart {
  hr: number = SIM.heart.baselineHR;
  /** Phase within the current beat, 0..1. */
  phase = 0;
  /** Normalized arterial waveform value, 0..1. */
  pulse = 0;
  private beatListeners = new Set<() => void>();

  onBeat(fn: () => void): () => void {
    this.beatListeners.add(fn);
    return () => this.beatListeners.delete(fn);
  }

  update(dt: number): void {
    this.phase += (dt * this.hr) / 60;
    if (this.phase >= 1) {
      this.phase -= Math.floor(this.phase);
      this.beatListeners.forEach((fn) => fn());
    }
    this.pulse = arterialWave(this.phase);
  }
}

/** Arterial pressure shape over one beat (phase 0 = R wave). */
export function arterialWave(ph: number): number {
  const delay = 0.08; // pulse transit after the R wave
  const p = (ph - delay + 1) % 1;
  const systolic = Math.exp(-Math.pow((p - 0.12) / 0.07, 2));
  const dicrotic = 0.32 * Math.exp(-Math.pow((p - 0.36) / 0.06, 2));
  const runoff = 0.25 * Math.exp(-p * 2.5);
  return Math.min(1, systolic + dicrotic + runoff);
}
