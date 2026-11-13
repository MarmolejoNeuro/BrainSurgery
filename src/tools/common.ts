import type * as THREE from 'three';
import type { Anatomy } from '../anatomy';
import { bus, type SimEvents } from '../core/events';
import type { I18nKey } from '../core/i18n';
import { state } from '../core/store';
import type { ToolId } from './types';

/** Mark a structure as identified (first touch only emits). */
export function touchStructure(id: string, tool: ToolId): void {
  if (state.identified.has(id)) return;
  state.identified.add(id);
  bus.emit('structure:touched', { id, tool });
}

const lastToast = new Map<string, number>();
/** Toast with per-key rate limiting so continuous actions don't spam. */
export function toast(key: I18nKey, level: SimEvents['toast']['level'] = 'info', minGap = 2.5): void {
  const now = performance.now() / 1000;
  if (now - (lastToast.get(key) ?? -99) < minGap) return;
  lastToast.set(key, now);
  bus.emit('toast', { key, level });
}

/** Raise the hidden rupture risk. */
export function stressDome(amount: number): void {
  state.ruptureRisk = Math.min(1, state.ruptureRisk + amount);
  bus.emit('dome:stressed', { amount, risk: state.ruptureRisk });
}

/** Distance (mm) from a point to the aneurysm dome surface (negative = inside). */
export function distanceToDome(an: Anatomy, p: THREE.Vector3): number {
  return p.distanceTo(an.aneurysm.domeCenter) - an.aneurysm.domeRadius;
}

/** Major arteries whose injury is serious (as opposed to small cortical vessels). */
export const MAJOR_ARTERIES = new Set(['ica', 'm1', 'm2sup', 'm2inf', 'a1', 'pcom', 'acha']);
