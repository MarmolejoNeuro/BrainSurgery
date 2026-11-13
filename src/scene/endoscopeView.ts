import * as THREE from 'three';

/**
 * Picture-in-picture endoscope view. Rendered directly into a corner of the
 * main canvas after the microscope post-processing, with its own wide-angle
 * camera and a light at the lens (endoscopes carry their own illumination).
 */
export class EndoscopeView {
  readonly camera = new THREE.PerspectiveCamera(70, 4 / 3, 0.3, 200);
  private light = new THREE.PointLight('#fff4e8', 0, 0, 0);
  private frame: HTMLElement;
  readonly rect = { x: 16, bottom: 104, w: 300, h: 225 };

  constructor(scene: THREE.Scene, parent: HTMLElement) {
    this.camera.add(this.light);
    scene.add(this.camera);
    this.frame = document.createElement('div');
    this.frame.className = 'pip-frame';
    Object.assign(this.frame.style, {
      left: `${this.rect.x}px`,
      bottom: `${this.rect.bottom}px`,
      width: `${this.rect.w}px`,
      height: `${this.rect.h}px`,
    });
    this.frame.innerHTML = '<span class="pip-label mono">ENDO 30°</span>';
    this.frame.style.display = 'none';
    parent.append(this.frame);
  }

  private ray = new THREE.Raycaster();
  private frustum = new THREE.Frustum();

  /**
   * True when `point` is inside the endoscope view and nothing opaque blocks
   * the line of sight (the first thing hit lies within `tolerance` mm of it).
   */
  sees(point: THREE.Vector3, roots: THREE.Object3D[], tolerance = 1.2): boolean {
    const cam = this.camera;
    cam.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    if (!this.frustum.containsPoint(point)) return false;
    const dir = point.clone().sub(cam.position);
    const dist = dir.length();
    this.ray.set(cam.position, dir.normalize());
    this.ray.far = dist + tolerance;
    const hit = this.ray.intersectObjects(roots, true).find((h) => {
      const ud = h.object.userData;
      if (!ud.kind || ud.cut || ud.kind === 'arachnoid' || ud.kind === 'adhesion' || ud.kind === 'scope') return false;
      for (let p: THREE.Object3D | null = h.object; p; p = p.parent) if (!p.visible) return false;
      return true;
    });
    return !!hit && hit.point.distanceTo(point) <= tolerance;
  }

  setPose(lens: THREE.Vector3, target: THREE.Vector3): void {
    this.camera.position.copy(lens);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, visible: boolean): void {
    this.frame.style.display = visible ? '' : 'none';
    if (!visible) return;
    const { x, bottom, w, h } = this.rect;
    const prevAuto = renderer.autoClear;
    renderer.setRenderTarget(null);
    renderer.autoClear = false;
    renderer.setScissorTest(true);
    renderer.setViewport(x, bottom, w, h);
    renderer.setScissor(x, bottom, w, h);
    renderer.setClearColor('#000000', 1);
    renderer.clear(true, true, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.light.intensity = 3;
    const bg = scene.background;
    scene.background = null;
    renderer.render(scene, this.camera);
    scene.background = bg;
    this.light.intensity = 0;
    renderer.setScissorTest(false);
    const size = renderer.getSize(new THREE.Vector2());
    renderer.setViewport(0, 0, size.x, size.y);
    renderer.autoClear = prevAuto;
  }
}
