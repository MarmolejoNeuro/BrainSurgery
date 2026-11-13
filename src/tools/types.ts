import * as THREE from 'three';
import type { Anatomy } from '../anatomy';
import type { Adhesions } from '../anatomy/adhesions';
import type { BleedingSystem } from '../physics/bleeding';
import type { Heart } from '../physics/heart';
import type { MicroscopeCamera } from '../scene/microscope';
import type { Effects } from './effects';

/** Tool ids in toolbar order: keys 1, 2, ... 9, 0. */
export const TOOL_ORDER = [
  'suction',
  'scissors',
  'bipolar',
  'dissector',
  'spatula',
  'clip',
  'icg',
  'doppler',
  'endoscope',
  'tempClip',
] as const;
export type ToolId = (typeof TOOL_ORDER)[number];

/** How the hovered target reacts to the active tool: drives the outline color. */
export type HoverClass = 'ok' | 'warn' | 'harm' | null;

export interface PickHit {
  object: THREE.Object3D;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  kind: string;
  id: string;
}

export interface ToolContext {
  anatomy: Anatomy;
  adhesions: Adhesions;
  scope: MicroscopeCamera;
  scene: THREE.Scene;
  heart: Heart;
  fx: Effects;
  blood: BleedingSystem;
  /** Group holding placed objects that can be picked (clips, temporary clip, parked scope). */
  placed: THREE.Group;
}

/**
 * Base class for an instrument. Cursor models are built with the TIP at the
 * origin and the shaft along local +Y; the manager orients them so the shaft
 * points back toward the surgeon's hands.
 */
export abstract class Tool {
  abstract readonly id: ToolId;
  readonly cursor = new THREE.Group();
  /** Whether picking stops at arachnoid membranes (scissors) or looks through them. */
  seesMembranes = false;
  /** Which hand holds it: shapes the approach angle of the shaft. */
  hand: 'left' | 'right' = 'right';
  /** Toggle tools (ICG) act on selection and do not take over the pointer. */
  readonly isToggle: boolean = false;

  constructor(protected ctx: ToolContext) {}

  classify(_hit: PickHit | null): HoverClass {
    return null;
  }
  onDown(_hit: PickHit | null): void {}
  onUp(): void {}
  /** Called every frame. `tipSpeed` is in mm/s. */
  update(_dt: number, _hit: PickHit | null, _pressed: boolean, _tipSpeed: number): void {}
  /** Pointer moved while pressed; dx/dy in CSS pixels. */
  onDrag(_hit: PickHit | null, _dx: number, _dy: number): void {}
  /** Return true when the wheel was consumed (otherwise it zooms). */
  onWheel(_e: WheelEvent): boolean {
    return false;
  }
  onKey(_e: KeyboardEvent): boolean {
    return false;
  }
  activate(): void {}
  deactivate(): void {}
}

/** Walk up from a hit child (e.g. a vessel end cap) to the mesh that owns the id. */
export function ownerOf(o: THREE.Object3D): THREE.Object3D {
  let cur = o;
  while (cur.parent && cur.parent.userData.id === o.userData.id && cur.parent.userData.kind === o.userData.kind) cur = cur.parent;
  return cur;
}
