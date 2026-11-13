import type * as THREE from 'three';
import type { I18nKey } from './i18n';
import type { ToolId } from '../tools/types';

/** Every simulation event, with its payload. Stages, mentor and vitals subscribe to these. */
export interface SimEvents {
  'tool:changed': { tool: ToolId | null };
  'arachnoid:cut': { id: string; kind: 'fissure' | 'cistern' };
  /** A structure was deliberately touched/inspected (dissector, Doppler). Used to "identify" anatomy. */
  'structure:touched': { id: string; tool: ToolId };
  'vessel:injured': { id: string; point: THREE.Vector3; severity: number };
  'bipolar:coag': { point: THREE.Vector3; targetId: string | null };
  'adhesion:broken': { index: number; clearance: number };
  'dome:stressed': { amount: number; risk: number };
  'retraction:changed': { value: number };
  'clip:applied': { index: number; variant: 'straight' | 'curved' };
  'clip:removed': { index: number };
  'tempclip:on': Record<string, never>;
  'tempclip:off': { duration: number };
  'icg:toggle': { on: boolean };
  'endoscope:parked': { parked: boolean };
  /** The endoscope has an unobstructed view of a structure ('acha', 'pcom', 'neck'). */
  'endoscope:sighted': { id: string };
  'doppler:checked': { id: string; flow: number };
  'subtask:done': { stage: number; id: string };
  'stage:completed': { index: number };
  'stage:changed': { index: number };
  'procedure:complete': Record<string, never>;
  'aneurysm:ruptured': { point: THREE.Vector3 };
  'bleed:started': { id: string; kind: 'ooze' | 'brisk' | 'arterial' };
  'bleed:stopped': { id: string; by: 'bipolar' | 'clip' | 'spontaneous' };
  toast: { key: I18nKey; level?: 'info' | 'ok' | 'warn' | 'alarm' };
}

type Handler<T> = (payload: T) => void;

class Bus {
  private map = new Map<keyof SimEvents, Set<Handler<never>>>();

  on<K extends keyof SimEvents>(type: K, fn: Handler<SimEvents[K]>): () => void {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type)!.add(fn as Handler<never>);
    return () => this.map.get(type)!.delete(fn as Handler<never>);
  }

  emit<K extends keyof SimEvents>(type: K, payload: SimEvents[K]): void {
    this.map.get(type)?.forEach((fn) => (fn as Handler<SimEvents[K]>)(payload));
  }
}

export const bus = new Bus();
