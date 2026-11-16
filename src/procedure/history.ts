import { CURRENT_CASE, type CaseId } from '../config/cases';
import type { Debrief } from './scoring';

/**
 * Run history, kept in this browser's localStorage only (nothing leaves the
 * machine). One entry per case attempt; reopening the debrief in the same run
 * updates that entry instead of adding a new one.
 */
export interface RunRecord {
  id: number;
  date: number;
  caseId: CaseId;
  seconds: number;
  ebl: number;
  result: Debrief['clipResult'];
  ruptured: boolean;
}

const KEY = 'icpc-sim.history.v1';
const MAX = 30;
const runId = Date.now();

export function loadHistory(): RunRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as RunRecord[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function save(list: RunRecord[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* storage blocked (private window): history just isn't kept */
  }
}

/** Records (or updates) this page load's run. Returns this run's id. */
export function recordRun(d: Debrief): number {
  const list = loadHistory().filter((r) => r.id !== runId);
  list.push({ id: runId, date: Date.now(), caseId: CURRENT_CASE, seconds: d.totalSeconds, ebl: d.ebl, result: d.clipResult, ruptured: d.ruptured });
  save(list);
  return runId;
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Best run of a case: a clean clip first, then least blood loss, then fastest. */
export function bestRun(list: RunRecord[]): RunRecord | undefined {
  const clean = list.filter((r) => r.result === 'complete' && !r.ruptured);
  return clean.sort((a, b) => a.ebl - b.ebl || a.seconds - b.seconds)[0];
}
