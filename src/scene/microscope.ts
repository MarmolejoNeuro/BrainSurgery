import * as THREE from 'three';
import { SIM } from '../config/sim';

const DEG = Math.PI / 180;

/**
 * Operating-microscope camera rig.
 *
 * A real microscope keeps a fixed working distance and changes magnification
 * optically, so zoom here narrows the field of view rather than moving the
 * camera. The optical axis can be tilted (polar angle) and swung around the
 * vertical (azimuth) about a focal point, which can be panned.
 */
export class MicroscopeCamera {
  readonly camera: THREE.PerspectiveCamera;
  readonly target = new THREE.Vector3(...SIM.microscope.initialTarget);

  mag: number = SIM.microscope.initialMag;
  tilt: number = SIM.microscope.initialTilt * DEG;
  azimuth: number = SIM.microscope.initialAzimuth * DEG;

  // Smoothed (displayed) values
  private cur = {
    mag: this.mag,
    tilt: this.tilt,
    azimuth: this.azimuth,
    target: this.target.clone(),
  };

  /** Lets the active tool consume the wheel (e.g. clip blade depth). */
  wheelInterceptor: ((e: WheelEvent) => boolean) | null = null;

  /** When false, left-drag is reserved for tools (orbit stays on middle drag). */
  leftDragOrbits = true;

  private dragMode: 'none' | 'orbit' | 'pan' = 'none';
  private last = new THREE.Vector2();
  private keys = new Set<string>();

  constructor(private dom: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(10, 1, 120, 600);
    this.camera.up.set(0, 0, -1); // screen-up = anterior/frontal (-Z)
    this.bind();
    this.apply();
  }

  /** Diameter of the visible field at the focal plane (mm). */
  get fieldDiameter(): number {
    return SIM.microscope.fieldAt1x / this.cur.mag;
  }

  get displayedMag(): number {
    return this.cur.mag;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Smoothly re-center on a world point (used by double-click focus). */
  focusOn(p: THREE.Vector3): void {
    this.target.copy(p);
    this.clampTarget();
  }

  zoomBy(factor: number): void {
    this.mag = THREE.MathUtils.clamp(this.mag * factor, SIM.microscope.minMag, SIM.microscope.maxMag);
  }

  private clampTarget(): void {
    const { min, max } = SIM.microscope.bounds;
    this.target.x = THREE.MathUtils.clamp(this.target.x, min[0], max[0]);
    this.target.y = THREE.MathUtils.clamp(this.target.y, min[1], max[1]);
    this.target.z = THREE.MathUtils.clamp(this.target.z, min[2], max[2]);
  }

  private bind(): void {
    const el = this.dom;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 1 || (e.button === 0 && this.leftDragOrbits)) this.dragMode = 'orbit';
      else if (e.button === 2) this.dragMode = 'pan';
      else return;
      this.last.set(e.clientX, e.clientY);
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (this.dragMode === 'none') return;
      const dx = e.clientX - this.last.x;
      const dy = e.clientY - this.last.y;
      this.last.set(e.clientX, e.clientY);
      if (this.dragMode === 'orbit') {
        this.azimuth -= dx * 0.005;
        this.tilt = THREE.MathUtils.clamp(this.tilt + dy * 0.005, 0, SIM.microscope.maxTilt * DEG);
      } else {
        this.panPixels(dx, dy);
      }
    });
    const end = (e: PointerEvent) => {
      this.dragMode = 'none';
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (this.wheelInterceptor?.(e)) return;
        this.zoomBy(Math.exp(-e.deltaY * 0.0012));
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      this.keys.add(e.key);
      if (e.key === '+' || e.key === '=') this.zoomBy(1.12);
      if (e.key === '-' || e.key === '_') this.zoomBy(1 / 1.12);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Pan the focal point in the camera's screen plane by a pixel delta. */
  private panPixels(dx: number, dy: number): void {
    const h = this.dom.clientHeight || 1;
    const mmPerPx = this.fieldDiameter / h;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    this.target.addScaledVector(right, -dx * mmPerPx);
    this.target.addScaledVector(up, dy * mmPerPx);
    this.clampTarget();
  }

  update(dt: number): void {
    // Keyboard panning (arrow keys)
    const speed = 300 * dt; // px-equivalent per second
    if (this.keys.has('ArrowLeft')) this.panPixels(speed, 0);
    if (this.keys.has('ArrowRight')) this.panPixels(-speed, 0);
    if (this.keys.has('ArrowUp')) this.panPixels(0, speed);
    if (this.keys.has('ArrowDown')) this.panPixels(0, -speed);

    const k = 1 - Math.exp(-SIM.microscope.damping * dt);
    this.cur.mag += (this.mag - this.cur.mag) * k;
    this.cur.tilt += (this.tilt - this.cur.tilt) * k;
    this.cur.azimuth += (this.azimuth - this.cur.azimuth) * k;
    this.cur.target.lerp(this.target, k);
    this.apply();
  }

  private apply(): void {
    const wd = SIM.microscope.workingDistance;
    const { tilt, azimuth, target } = this.cur;
    // Optical axis direction from the focal point toward the objective.
    const dir = new THREE.Vector3(
      Math.sin(tilt) * Math.cos(azimuth),
      Math.cos(tilt),
      Math.sin(tilt) * Math.sin(azimuth),
    );
    this.camera.position.copy(target).addScaledVector(dir, wd);
    this.camera.lookAt(target);
    // Vertical FOV such that the vertical field equals the field diameter.
    const fov = 2 * Math.atan(this.fieldDiameter / 2 / wd) / DEG;
    if (Math.abs(fov - this.camera.fov) > 1e-4) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
  }

  /** Current smoothed focal point. */
  get focalPoint(): THREE.Vector3 {
    return this.cur.target;
  }
}
