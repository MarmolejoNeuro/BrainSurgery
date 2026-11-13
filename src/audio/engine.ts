/**
 * Web Audio engine. All sounds are synthesized (no audio files):
 *  - Doppler: band-passed noise whose centre frequency follows blood velocity,
 *    which is exactly what a real Doppler probe sonifies (the frequency shift).
 *  - Suction: continuous filtered hiss.
 *  - Bipolar: buzzing square wave while coagulating.
 *  - Scissors: short click/snip.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noiseBuf!: AudioBuffer;

  private dopplerFilter!: BiquadFilterNode;
  private dopplerGain!: GainNode;
  private suctionGain!: GainNode;
  private bipolarGain!: GainNode;
  private suctionFilter!: BiquadFilterNode;

  muted = false;

  /** Must be called from a user gesture (the start button). */
  init(): void {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);

    // 2 s of white noise, looped by every noise voice.
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // Doppler voice
    this.dopplerFilter = ctx.createBiquadFilter();
    this.dopplerFilter.type = 'bandpass';
    this.dopplerFilter.Q.value = 6;
    this.dopplerFilter.frequency.value = 400;
    this.dopplerGain = ctx.createGain();
    this.dopplerGain.gain.value = 0;
    this.noise().connect(this.dopplerFilter).connect(this.dopplerGain).connect(this.master);

    // Suction voice
    const sf = ctx.createBiquadFilter();
    this.suctionFilter = sf;
    sf.type = 'highpass';
    sf.frequency.value = 1800;
    this.suctionGain = ctx.createGain();
    this.suctionGain.gain.value = 0;
    this.noise().connect(sf).connect(this.suctionGain).connect(this.master);

    // Bipolar voice
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 180;
    const bf = ctx.createBiquadFilter();
    bf.type = 'lowpass';
    bf.frequency.value = 1400;
    this.bipolarGain = ctx.createGain();
    this.bipolarGain.gain.value = 0;
    osc.connect(bf).connect(this.bipolarGain).connect(this.master);
    osc.start();
  }

  private noise(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.start(0, Math.random() * 2);
    return src;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  /**
   * Update the Doppler voice every frame.
   * @param velocity normalized blood velocity 0..1 at this instant (pulsatile)
   * @param flow relative flow in the insonated vessel (0 = occluded → silence)
   * @param pitch multiplier (>1 when a vessel is narrowed: faster jet, higher shift)
   */
  doppler(active: boolean, velocity: number, flow: number, pitch = 1): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const on = active && flow > 0.02;
    const freq = (250 + 1100 * velocity) * pitch;
    this.dopplerFilter.frequency.setTargetAtTime(freq, t, 0.012);
    this.dopplerGain.gain.setTargetAtTime(on ? (0.06 + 0.5 * velocity) * Math.min(1, flow * 1.2) : 0, t, 0.015);
  }

  suction(on: boolean): void {
    if (!this.ctx) return;
    this.suctionGain.gain.setTargetAtTime(on ? 0.12 : 0, this.ctx.currentTime, 0.04);
  }

  bipolar(on: boolean): void {
    if (!this.ctx) return;
    this.bipolarGain.gain.setTargetAtTime(on ? 0.05 : 0, this.ctx.currentTime, 0.02);
  }

  /** Short metallic snip. */
  snip(): void {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = this.noise();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 5200;
    f.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    src.connect(f).connect(g).connect(this.master);
    src.stop(t + 0.1);
  }

  private lastAlarm = 0;

  /** Pulse oximeter beep on each heartbeat; pitch falls with saturation, as on real monitors. */
  pulseBeep(spo2: number): void {
    if (!this.ctx || this.pulseMuted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 440 + (Math.max(80, Math.min(100, spo2)) - 80) * 22;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.1);
  }
  pulseMuted = false;
  /** Alarms are silenced until this AudioContext time. */
  alarmSilencedUntil = 0;

  /** IEC-style alarm bursts: medium = 3 beeps, high = 3+2 faster, higher pitch. */
  alarm(level: 'medium' | 'high'): void {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    if (t0 < this.alarmSilencedUntil || t0 - this.lastAlarm < 1.5) return;
    this.lastAlarm = t0;
    const n = level === 'high' ? 5 : 3;
    const f = level === 'high' ? 960 : 700;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (level === 'high' ? 0.12 : 0.2) + (level === 'high' && i >= 3 ? 0.25 : 0);
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      const flt = ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.value = 2200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.01);
      g.gain.setValueAtTime(0.07, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(flt).connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.12);
    }
  }

  silenceAlarms(seconds: number): void {
    if (this.ctx) this.alarmSilencedUntil = this.ctx.currentTime + seconds;
  }

  /** Suction sounds lower and "wetter" when it is actually aspirating blood. */
  suctionLoad(loaded: boolean): void {
    if (!this.ctx) return;
    this.suctionFilter.frequency.setTargetAtTime(loaded ? 700 : 1800, this.ctx.currentTime, 0.05);
  }

  /** Gentle two-note chime when a stage is completed. */
  chime(): void {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    [660, 990].forEach((f, i) => {
      const t = t0 + i * 0.12;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.65);
    });
  }

  /** Soft UI/tool click (clip application, temporary clip). */
  click(freq = 1400): void {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.1);
  }
}

export const audio = new AudioEngine();
