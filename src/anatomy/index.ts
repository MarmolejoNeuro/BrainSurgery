import * as THREE from 'three';
import { ANATOMY } from '../config/anatomy';
import { buildAneurysm, type Aneurysm } from './aneurysm';
import { Arachnoid } from './arachnoid';
import { buildLobe, buildSkullBase, buildSylvianVein, surfaceHeight } from './brain';
import { buildNerves } from './nerves';
import { buildSpatula } from './spatulas';
import { buildVessels, type Vessel } from './vessels';

/**
 * Assembles the surgical field and owns anatomy-level state such as
 * retraction. Every pickable mesh carries userData { kind, id, labelKey }.
 */
export class Anatomy {
  readonly root = new THREE.Group();
  readonly frontal: THREE.Group;
  readonly temporal: THREE.Group;
  readonly frontalMesh: THREE.Mesh;
  readonly temporalMesh: THREE.Mesh;
  readonly vessels: Map<string, Vessel>;
  readonly nerves: Map<string, THREE.Mesh>;
  readonly aneurysm: Aneurysm;
  readonly arachnoid: Arachnoid;
  private _retraction = -1;

  constructor() {
    // Lobes live in groups whose local z = 0 is the fissure face; retraction moves the groups.
    this.frontalMesh = buildLobe(ANATOMY.frontalLobe, -1, 'frontal', 3);
    this.temporalMesh = buildLobe(ANATOMY.temporalLobe, 1, 'temporal', 8);
    this.frontal = new THREE.Group();
    this.temporal = new THREE.Group();
    this.frontal.add(this.frontalMesh);
    this.temporal.add(this.temporalMesh);

    const vein = buildSylvianVein(this.temporalMesh);
    if (vein) this.temporal.add(vein);

    this.frontal.add(buildSpatula(-1, ANATOMY.spatulas.frontal));
    this.temporal.add(buildSpatula(1, ANATOMY.spatulas.temporal));

    this.vessels = buildVessels();
    this.nerves = buildNerves();
    this.aneurysm = buildAneurysm(this.vessels.get('ica')!);

    this.arachnoid = new Arachnoid((lobe, x, z) => {
      const mesh = lobe === 'frontal' ? this.frontalMesh : this.temporalMesh;
      return surfaceHeight(mesh, x, z) ?? 0;
    });

    this.root.add(this.frontal, this.temporal, buildSkullBase(), this.aneurysm.group, this.arachnoid.group);
    this.vessels.forEach((v) => this.root.add(v.mesh));
    this.nerves.forEach((n) => this.root.add(n));

    this.setRetraction(ANATOMY.fissure.initialRetraction);
  }

  get retraction(): number {
    return this._retraction;
  }

  /**
   * Maximum retraction currently allowed: limited while the superficial
   * arachnoid still binds the fissure, fully available once it is opened.
   */
  get retractionLimit(): number {
    const f = ANATOMY.fissure;
    return f.retractionWhenClosed + (1 - f.retractionWhenClosed) * this.arachnoid.fissureOpenFraction;
  }

  /** 0 = fissure closed, 1 = maximal spatula retraction. */
  setRetraction(r: number): void {
    r = THREE.MathUtils.clamp(r, 0, 1);
    if (r === this._retraction) return;
    this._retraction = r;
    const f = ANATOMY.fissure;
    const half = f.baseHalfGap + r * f.maxRetraction;
    // Frontal lobe is anterior (-Z), temporal posterior (+Z).
    const zF = f.centerZ - half;
    const zT = f.centerZ + half;
    this.frontal.position.z = zF;
    this.temporal.position.z = zT;
    this.arachnoid.setFissureEdges(zF, zT);
  }

  /** Over-retracted brain blanches (venous congestion/ischemia cue). 0..1 */
  setBlanching(b: number): void {
    for (const m of [this.frontalMesh, this.temporalMesh]) {
      const mat = m.material as THREE.MeshPhysicalMaterial;
      mat.emissive.setRGB(0.22 * b, 0.2 * b, 0.18 * b);
    }
  }

  setLobesVisible(v: boolean): void {
    this.frontal.visible = v;
    this.temporal.visible = v;
  }

  update(dt: number): void {
    this.arachnoid.update(dt);
  }
}
