import * as THREE from 'three';
import type { Anatomy } from '../anatomy';
import { audio } from '../audio/engine';
import { SIM } from '../config/sim';
import { bus } from '../core/events';
import { state } from '../core/store';
import type { Heart } from './heart';
import { arterialWave } from './heart';

const B = SIM.bleeding;

export type BleedKind = 'ooze' | 'brisk' | 'arterial';

export interface BleedSource {
  id: string;
  kind: BleedKind;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  /** Vessel whose flow feeds it ('dome' for the aneurysm). */
  vessel: string;
  baseRate: number;
  /** Current rate (ml/s). */
  rate: number;
  active: boolean;
  age: number;
  marker: THREE.Mesh;
  emitAcc: number;
}

const MAX_DROPS = 900;

/**
 * Bleeding and hemostasis.
 *
 *  - OOZE: small vessels/veins. Low flow, slowly stops by itself; bipolar stops it.
 *  - BRISK: side-wall injury of a major artery; bipolar can seal it.
 *  - ARTERIAL: intraoperative aneurysm rupture. Flow follows the arterial
 *    pressure and the dome's inflow, so a temporary clip on the proximal ICA
 *    slows it and only a clip that excludes the dome stops it.
 *
 * Rendering: instanced droplets (spurting in systole) and a pooling layer whose
 * height follows the blood volume left in the field; suction removes both.
 */
export class BleedingSystem {
  readonly group = new THREE.Group();
  readonly sources: BleedSource[] = [];
  private drops: THREE.InstancedMesh;
  private dPos = new Float32Array(MAX_DROPS * 3);
  private dVel = new Float32Array(MAX_DROPS * 3);
  private dLife = new Float32Array(MAX_DROPS);
  private dCount = 0;
  private pool: THREE.Mesh;
  private poolNormal: THREE.Texture;
  private markerMat = new THREE.MeshPhysicalMaterial({ color: '#4a0608', roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
  /** Coagulated spot: brown-grey eschar. */
  private coagMat = new THREE.MeshPhysicalMaterial({ color: '#4b3a33', roughness: 0.6, clearcoat: 0.3 });
  private nextId = 0;
  private ruptureCheck = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();

  constructor(private anatomy: Anatomy, private heart: Heart) {
    const dropMat = new THREE.MeshPhysicalMaterial({ color: '#6e0b0d', roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 });
    this.drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), dropMat, MAX_DROPS);
    this.drops.count = 0;
    this.drops.frustumCulled = false;
    this.drops.userData = { kind: 'blood', id: 'drops', labelKey: 'label.blood' };

    this.poolNormal = makeRippleTexture();
    const poolMat = new THREE.MeshPhysicalMaterial({
      color: '#3a0305',
      roughness: 0.08,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      normalMap: this.poolNormal,
      normalScale: new THREE.Vector2(0.25, 0.25),
      transparent: true,
      opacity: 0.97,
      sheen: 0.3,
      sheenColor: new THREE.Color('#ff4040'),
    });
    this.pool = new THREE.Mesh(new THREE.CircleGeometry(36, 64), poolMat);
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.set(4, B.poolBaseY, 1);
    this.pool.renderOrder = 1;
    this.pool.visible = false;
    this.pool.userData = { kind: 'blood', id: 'pool', labelKey: 'label.blood' };
    this.group.add(this.drops, this.pool);

    // Opening the arachnoid sometimes tears a small bridging vessel.
    bus.on('arachnoid:cut', ({ id }) => {
      if (!id.startsWith('fissure-') || Math.random() > B.oozeChanceOnCut) return;
      const seg = this.anatomy.arachnoid.byId.get(id);
      if (!seg) return;
      seg.mesh.geometry.computeBoundingBox();
      const p = seg.mesh.geometry.boundingBox!.getCenter(new THREE.Vector3());
      p.z += (Math.random() - 0.5) * 3;
      this.add('ooze', p, new THREE.Vector3(0, 1, 0), 'cortical', B.oozeRate * (0.5 + Math.random() * 0.6));
    });
    bus.on('vessel:injured', ({ id, point, severity }) => {
      if (id === 'dome') {
        if (severity >= 0.8) this.rupture(point);
        return;
      }
      const major = severity >= 0.6;
      this.add(major ? 'brisk' : 'ooze', point, new THREE.Vector3(0, 1, 0), id, major ? B.briskRate : B.oozeRate * (1 + severity));
    });
    bus.on('bipolar:coag', ({ point, targetId }) => {
      const src = this.sources.find((s) => s.active && (s.id === targetId || s.point.distanceTo(point) < 1.5));
      if (!src) return;
      if (src.kind === 'arterial') {
        bus.emit('toast', { key: 'toast.bipolarArterial', level: 'alarm' });
        return;
      }
      this.stop(src, 'bipolar');
    });
  }

  /** Nearest active bleeding point within `radius` mm (bipolar targets it before anything else). */
  nearestActive(p: THREE.Vector3, radius: number): BleedSource | null {
    let best: BleedSource | null = null, bd = radius;
    for (const s of this.sources) {
      if (!s.active) continue;
      const d = s.point.distanceTo(p);
      if (d <= bd) (bd = d), (best = s);
    }
    return best;
  }

  get poolLevel(): number {
    return Math.min(B.poolMaxY, B.poolBaseY + (state.fieldBlood * 1000) / B.poolArea);
  }

  get arterialActive(): boolean {
    return this.sources.some((s) => s.active && s.kind === 'arterial' && s.rate > 0.05);
  }

  get oozeActive(): boolean {
    return this.sources.some((s) => s.active && s.kind !== 'arterial');
  }

  private add(kind: BleedKind, point: THREE.Vector3, normal: THREE.Vector3, vessel: string, rate: number): BleedSource {
    const id = `bleeder-${this.nextId++}`;
    const r = kind === 'arterial' ? 0.7 : kind === 'brisk' ? 0.55 : 0.4;
    const marker = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), this.markerMat);
    marker.scale.y = 0.55;
    marker.position.copy(point);
    marker.userData = { kind: 'bleeder', id, labelKey: kind === 'arterial' ? 'label.ruptureSite' : 'label.bleeder' };
    this.group.add(marker);
    const src: BleedSource = { id, kind, point: point.clone(), normal: normal.clone().normalize(), vessel, baseRate: rate, rate, active: true, age: 0, marker, emitAcc: 0 };
    this.sources.push(src);
    bus.emit('bleed:started', { id, kind });
    if (kind !== 'arterial') bus.emit('toast', { key: kind === 'brisk' ? 'toast.briskBleed' : 'toast.ooze', level: kind === 'brisk' ? 'alarm' : 'warn' });
    return src;
  }

  private stop(src: BleedSource, by: 'bipolar' | 'clip' | 'spontaneous'): void {
    src.active = false;
    src.rate = 0;
    src.marker.material = this.coagMat;
    src.marker.scale.multiplyScalar(0.7);
    src.marker.userData = { kind: 'coagulated', id: src.id };
    bus.emit('bleed:stopped', { id: src.id, by });
    if (by === 'bipolar') bus.emit('toast', { key: 'toast.bleedStopped', level: 'ok' });
  }

  /** Intraoperative rupture: a fast arterial jet from the dome (usually the bleb). */
  rupture(at?: THREE.Vector3): void {
    if (state.ruptured) return;
    const an = this.anatomy.aneurysm;
    const p = at ? at.clone() : an.blebCenter.clone();
    const normal = p.clone().sub(an.domeCenter).normalize();
    state.ruptured = true;
    state.ruptureTime = state.elapsed;
    this.add('arterial', p, normal, 'dome', B.ruptureRate);
    audio.alarm('high');
    bus.emit('aneurysm:ruptured', { point: p });
    bus.emit('toast', { key: 'toast.rupture', level: 'alarm' });
  }

  /**
   * Suction at a tip position for dt seconds. Returns ml removed.
   * It clears pooled blood when the tip reaches the surface, and nearby droplets.
   */
  suction(tip: THREE.Vector3, dt: number): number {
    let removed = 0;
    if (state.fieldBlood > 0 && tip.y < this.poolLevel + 2.5) {
      removed = Math.min(state.fieldBlood, B.suctionRate * dt);
      state.fieldBlood -= removed;
    }
    for (let i = 0; i < this.dCount; i++) {
      const dx = this.dPos[i * 3] - tip.x, dy = this.dPos[i * 3 + 1] - tip.y, dz = this.dPos[i * 3 + 2] - tip.z;
      if (dx * dx + dy * dy + dz * dz < 6) this.dLife[i] = 0;
    }
    return removed;
  }

  private spawnDrop(src: BleedSource, speed: number, spread: number): void {
    if (this.dCount >= MAX_DROPS) return;
    const i = this.dCount++;
    const dir = src.normal.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(spread)).normalize();
    const v = dir.multiplyScalar(speed * (0.6 + Math.random() * 0.5));
    this.dPos.set([src.point.x, src.point.y, src.point.z], i * 3);
    this.dVel.set([v.x, v.y, v.z], i * 3);
    this.dLife[i] = 2.2;
  }

  update(dt: number): void {
    // Probabilistic rupture once the hidden risk is high.
    this.ruptureCheck += dt;
    if (this.ruptureCheck >= 1) {
      this.ruptureCheck = 0;
      const r = state.ruptureRisk;
      if (!state.ruptured && (r >= 1 || (r > B.ruptureThreshold && Math.random() < (r - B.ruptureThreshold) * 0.6))) this.rupture();
    }

    const pressure = state.vitals.map / 92;
    const pulse = arterialWave(this.heart.phase);
    let total = 0;
    for (const s of this.sources) {
      if (!s.active) continue;
      s.age += dt;
      const flow = s.vessel === 'cortical' ? 1 : state.flow[s.vessel] ?? 1;
      if (s.kind === 'ooze') {
        s.rate = s.baseRate * Math.pow(0.5, s.age / B.oozeHalfLife);
        if (s.rate < 0.01) {
          this.stop(s, 'spontaneous');
          continue;
        }
      } else s.rate = s.baseRate * flow * pressure;
      // A dome excluded by the clip stops bleeding (the source stays, controlled).
      total += s.rate;
      s.marker.scale.set(1, 0.55 + 0.25 * pulse * Math.min(1, s.rate), 1);

      // Droplets: arterial jets spurt in systole; ooze drips.
      const perSec = s.kind === 'arterial' ? 160 * s.rate / B.ruptureRate * (0.25 + 1.5 * pulse) : s.kind === 'brisk' ? 30 * (0.4 + pulse) : 5;
      s.emitAcc += perSec * dt;
      while (s.emitAcc >= 1) {
        s.emitAcc -= 1;
        if (s.kind === 'arterial') this.spawnDrop(s, 10 + 10 * pulse * Math.min(1, s.rate / 2), 0.35);
        else if (s.kind === 'brisk') this.spawnDrop(s, 4 + 3 * pulse, 0.5);
        else this.spawnDrop(s, 0.6, 0.8);
      }
    }
    state.bleedRate = total;
    state.arterialBleeding = this.arterialActive;
    state.oozing = this.oozeActive;
    state.ebl += total * dt;
    // Once the field is full, extra blood spills out of the craniotomy (still counted in EBL).
    const capacity = ((B.poolMaxY - B.poolBaseY) * B.poolArea) / 1000;
    state.fieldBlood = Math.min(capacity, state.fieldBlood + total * dt);

    // Droplet physics: gravity (-Y); they vanish into the pool or after their life.
    const level = this.poolLevel;
    let w = 0;
    for (let i = 0; i < this.dCount; i++) {
      this.dLife[i] -= dt;
      this.dVel[i * 3 + 1] -= 45 * dt;
      this.dPos[i * 3] += this.dVel[i * 3] * dt;
      this.dPos[i * 3 + 1] += this.dVel[i * 3 + 1] * dt;
      this.dPos[i * 3 + 2] += this.dVel[i * 3 + 2] * dt;
      if (this.dLife[i] <= 0 || this.dPos[i * 3 + 1] < level) continue;
      if (w !== i) {
        this.dPos.copyWithin(w * 3, i * 3, i * 3 + 3);
        this.dVel.copyWithin(w * 3, i * 3, i * 3 + 3);
        this.dLife[w] = this.dLife[i];
      }
      w++;
    }
    this.dCount = w;
    for (let i = 0; i < w; i++) {
      const sp = Math.hypot(this.dVel[i * 3], this.dVel[i * 3 + 1], this.dVel[i * 3 + 2]);
      this.s.set(1, 1 + Math.min(sp * 0.04, 1.2), 1);
      this.q.setFromUnitVectors(UP, new THREE.Vector3(this.dVel[i * 3], this.dVel[i * 3 + 1], this.dVel[i * 3 + 2]).normalize());
      this.m.compose(new THREE.Vector3(this.dPos[i * 3], this.dPos[i * 3 + 1], this.dPos[i * 3 + 2]), this.q, this.s);
      this.drops.setMatrixAt(i, this.m);
    }
    this.drops.count = w;
    this.drops.instanceMatrix.needsUpdate = true;

    // Pool
    this.pool.visible = state.fieldBlood > 0.05;
    this.pool.position.y = level;
    this.poolNormal.offset.x += dt * 0.01;
    this.poolNormal.offset.y += dt * 0.006;
  }
}

const UP = new THREE.Vector3(0, 1, 0);

/** Soft ripple normal map for the blood surface. */
function makeRippleTexture(): THREE.Texture {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2, v = (y / size) * Math.PI * 2;
      const dx = Math.cos(u * 3 + v) * 0.5 + Math.cos(u * 7 - v * 2) * 0.3;
      const dy = Math.sin(v * 4 + u) * 0.5 + Math.sin(v * 9 - u * 3) * 0.25;
      const i = (y * size + x) * 4;
      data[i] = 128 + dx * 60;
      data[i + 1] = 128 + dy * 60;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.needsUpdate = true;
  return tex;
}
