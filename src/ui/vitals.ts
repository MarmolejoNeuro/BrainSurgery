import { audio } from '../audio/engine';
import { t, type I18nKey } from '../core/i18n';
import { state, tempOcclusionSeconds } from '../core/store';
import { arterialWave, type Heart } from '../physics/heart';
import { h } from './dom';

/** Synthetic ECG (lead II-like) as a sum of Gaussians: P, Q, R, S, T. */
function ecgWave(ph: number): number {
  const g = (mu: number, sd: number, a: number) => a * Math.exp(-Math.pow((ph - mu) / sd, 2));
  return g(0.9, 0.03, 0.12) + g(0.985, 0.006, -0.1) + g(0.0, 0.009, 1.0) + g(1.0, 0.009, 1.0) + g(0.018, 0.008, -0.22) + g(0.3, 0.05, 0.25);
}

const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** A sweeping monitor trace (like a real monitor: overwrite with an erase gap). */
class Trace {
  readonly canvas = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  private x = 0;
  private lastY: number | null = null;
  constructor(private color: string, w = 190, hgt = 44) {
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = w * dpr;
    this.canvas.height = hgt * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${hgt}px`;
    this.g = this.canvas.getContext('2d')!;
    this.g.scale(dpr, dpr);
  }
  /** Push normalized samples (0 bottom .. 1 top); speed in px per sample. */
  push(samples: number[], pxPerSample: number): void {
    const g = this.g;
    const w = this.canvas.width / Math.min(window.devicePixelRatio, 2);
    const hgt = this.canvas.height / Math.min(window.devicePixelRatio, 2);
    g.strokeStyle = this.color;
    g.lineWidth = 1.4;
    for (const v of samples) {
      const nx = this.x + pxPerSample;
      g.clearRect(this.x + 1, 0, 10, hgt); // erase gap ahead of the pen
      const y = hgt - 4 - v * (hgt - 8);
      if (this.lastY !== null) {
        g.beginPath();
        g.moveTo(this.x, this.lastY);
        g.lineTo(nx, y);
        g.stroke();
      }
      this.x = nx;
      this.lastY = y;
      if (this.x >= w) {
        this.x = 0;
        this.lastY = null;
      }
    }
  }
}

/**
 * OR-style vitals monitor (top right): ECG and arterial line traces, HR, ABP,
 * SpO2, MEP, operation time, temporary occlusion time and estimated blood loss.
 * Values in alarm blink red; audible alarms can be silenced for 2 minutes.
 */
export class VitalsPanel {
  private el = h('div.vitals.panel');
  private ecg = new Trace('#5ce07a');
  private abp = new Trace('#ff6b6b');
  private v: Record<string, HTMLElement> = {};
  private alarmLine = h('div.alarm-line');
  private lastPhase = 0;
  private alarmTimer = 0;
  private muteBtn: HTMLButtonElement;
  private silenceBtn: HTMLButtonElement;

  constructor(parent: HTMLElement, private heart: Heart) {
    const num = (key: string, cls: string) => (this.v[key] = h(`span.num.mono.${cls}`, {}, '--'));
    const label = (k: I18nKey) => h('span.lbl', { i18n: k });
    this.muteBtn = h('button.mini-btn', { onclick: () => this.toggleBeep() }) as HTMLButtonElement;
    this.silenceBtn = h('button.mini-btn', { onclick: () => audio.silenceAlarms(120) }) as HTMLButtonElement;
    this.el.append(
      h('div.vrow', {}, h('div.trace', {}, this.ecg.canvas), h('div.big.hr', {}, label('vitals.hr'), num('hr', 'green'))),
      h('div.vrow', {}, h('div.trace', {}, this.abp.canvas), h('div.big.abp', {}, label('vitals.abp'), num('abp', 'red'), num('map', 'red.small'))),
      h(
        'div.vgrid',
        {},
        h('div.cell', {}, label('vitals.spo2'), num('spo2', 'cyan')),
        h('div.cell', {}, label('vitals.mep'), num('mep', 'white')),
        h('div.cell', {}, label('vitals.ebl'), num('ebl', 'white')),
        h('div.cell', {}, label('vitals.orTime'), num('or', 'white')),
        h('div.cell.occl', {}, label('vitals.occl'), num('occl', 'amber')),
        h('div.cell', {}, label('vitals.bleed'), num('bleed', 'white')),
      ),
      this.alarmLine,
      h('div.vbtns', {}, this.muteBtn, this.silenceBtn),
    );
    parent.append(this.el);
    this.refreshLabels();
    heart.onBeat(() => audio.pulseBeep(state.vitals.spo2));
  }

  private toggleBeep(): void {
    audio.pulseMuted = !audio.pulseMuted;
    this.refreshLabels();
  }

  refreshLabels(): void {
    this.el.querySelectorAll<HTMLElement>('[data-i18n]').forEach((e) => (e.textContent = t(e.dataset.i18n as I18nKey)));
    this.muteBtn.textContent = t(audio.pulseMuted ? 'vitals.beepOff' : 'vitals.beepOn');
    this.silenceBtn.textContent = t('vitals.silence');
  }

  /** Called every frame: draws traces; numbers update at ~4 Hz. */
  frame(dt: number): void {
    // Sub-sample the waveforms between frames so the QRS stays sharp.
    const n = 6;
    let ph0 = this.lastPhase;
    const ph1 = this.heart.phase;
    let d = ph1 - ph0;
    if (d < 0) d += 1;
    const ecgS: number[] = [], abpS: number[] = [];
    const v = state.vitals;
    for (let i = 1; i <= n; i++) {
      const p = (ph0 + (d * i) / n) % 1;
      ecgS.push(0.25 + ecgWave(p) * 0.6);
      // Arterial trace scaled on a 40–180 mmHg window.
      const mmHg = v.dia + (v.sys - v.dia) * arterialWave(p);
      abpS.push((mmHg - 40) / 140);
    }
    this.lastPhase = ph1;
    const pxPerSample = (55 * dt) / n; // ~25 mm/s sweep
    this.ecg.push(ecgS, pxPerSample);
    this.abp.push(abpS, pxPerSample);

    this.alarmTimer += dt;
    if (v.alarms.length && this.alarmTimer > 4) {
      this.alarmTimer = 0;
      audio.alarm(v.alarms.includes('alarm.mapLow') || v.alarms.includes('alarm.mepLow') ? 'high' : 'medium');
    }
  }

  update(): void {
    const v = state.vitals;
    const occl = tempOcclusionSeconds();
    this.v.hr.textContent = String(Math.round(v.hr));
    this.v.abp.textContent = `${Math.round(v.sys)}/${Math.round(v.dia)}`;
    this.v.map.textContent = `(${Math.round(v.map)})`;
    this.v.spo2.textContent = `${Math.round(v.spo2)}%`;
    this.v.mep.textContent = `${Math.round(v.mep)}%`;
    this.v.ebl.textContent = `${Math.round(state.ebl)} ml`;
    this.v.or.textContent = fmtTime(state.elapsed);
    this.v.occl.textContent = state.tempClip.on ? fmtTime(occl) : '--:--';
    this.v.bleed.textContent = state.bleedRate > 0.01 ? `${state.bleedRate.toFixed(1)} ml/s` : '—';

    const al = v.alarms;
    this.v.hr.classList.toggle('alarm', al.includes('alarm.hrHigh'));
    this.v.abp.classList.toggle('alarm', al.includes('alarm.mapLow'));
    this.v.map.classList.toggle('alarm', al.includes('alarm.mapLow'));
    this.v.spo2.classList.toggle('alarm', al.includes('alarm.spo2Low'));
    this.v.mep.classList.toggle('alarm', al.includes('alarm.mepLow'));
    this.v.mep.classList.toggle('warn', v.mep < 80 && v.mep >= 50);
    this.v.occl.classList.toggle('alarm', al.includes('alarm.occlusionLong'));
    this.v.occl.classList.toggle('warn', state.tempClip.on && occl > 300);
    this.v.bleed.classList.toggle('alarm', state.bleedRate > 1);
    this.alarmLine.textContent = al.map((k) => t(k as I18nKey)).join(' · ');
    this.alarmLine.style.display = al.length ? '' : 'none';
  }
}
