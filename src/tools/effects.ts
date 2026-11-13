import * as THREE from 'three';

interface Burst {
  points: THREE.Points;
  vel: Float32Array;
  life: number;
  maxLife: number;
  gravity: number;
}

/** Tiny particle bursts: bipolar sparks, coagulation steam, snip debris. */
export class Effects {
  readonly group = new THREE.Group();
  private bursts: Burst[] = [];
  private sprite = makeSprite();

  burst(at: THREE.Vector3, opts: { color: string; count?: number; speed?: number; size?: number; life?: number; gravity?: number; up?: THREE.Vector3 }): void {
    const n = opts.count ?? 24;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    const up = opts.up ?? new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      pos.set([at.x, at.y, at.z], i * 3);
      v.randomDirection().addScaledVector(up, 0.8).normalize().multiplyScalar((opts.speed ?? 6) * (0.4 + Math.random() * 0.6));
      vel.set([v.x, v.y, v.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: opts.color,
      size: opts.size ?? 0.35,
      map: this.sprite,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    this.group.add(points);
    const life = opts.life ?? 0.5;
    this.bursts.push({ points, vel, life, maxLife: life, gravity: opts.gravity ?? -8 });
  }

  update(dt: number): void {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      const pos = b.points.geometry.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) {
        b.vel[k * 3 + 1] += b.gravity * dt;
        pos.setXYZ(k, pos.getX(k) + b.vel[k * 3] * dt, pos.getY(k) + b.vel[k * 3 + 1] * dt, pos.getZ(k) + b.vel[k * 3 + 2] * dt);
      }
      pos.needsUpdate = true;
      (b.points.material as THREE.PointsMaterial).opacity = Math.max(0, b.life / b.maxLife);
      if (b.life <= 0) {
        this.group.remove(b.points);
        b.points.geometry.dispose();
        (b.points.material as THREE.Material).dispose();
        this.bursts.splice(i, 1);
      }
    }
  }
}

function makeSprite(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
