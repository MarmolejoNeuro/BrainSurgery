import { ANATOMY, type V3 } from './anatomy';
import type { I18nKey } from '../core/i18n';

/**
 * CLINICAL CASES
 *
 * Each case is a set of overrides on top of ANATOMY (config/anatomy.ts).
 * Only list what differs from the base IC-PC case; everything else is shared.
 * The case is chosen on the start screen and carried in the URL (?case=acha),
 * so "Restart case" reloads the same case.
 *
 * To add a case: add an entry here, plus its title/description strings in
 * core/i18n/en.ts and es.ts.
 */
export interface CaseDef {
  title: I18nKey;
  description: I18nKey;
  overrides: (a: typeof ANATOMY) => void;
}

export const CASES = {
  /** The base case: aneurysm at the ICA–PCom junction (config/anatomy.ts as written). */
  icpc: {
    title: 'case.icpc.title',
    description: 'case.icpc.desc',
    overrides: () => {},
  },

  /**
   * Anterior choroidal (IC-AChA) aneurysm: arises from the posterior wall of the
   * ICA a few mm DISTAL to the PCom, just proximal to the AChA origin. Smaller
   * and with a narrower neck than the IC-PC case, but the AChA leaves right at
   * the distal neck: a blade tip that catches it can cause hemiplegia, so the
   * endoscope check behind the dome matters even more here.
   */
  acha: {
    title: 'case.acha.title',
    description: 'case.acha.desc',
    overrides: (a) => {
      a.aneurysm.icaT = 0.62;
      a.aneurysm.diameter = 5.2;
      a.aneurysm.neckWidth = 3.2;
      // Posterolateral, less inferior than the IC-PC aneurysm.
      a.aneurysm.projection = [0.85, -0.45, 0.55] as V3;
      a.aneurysm.bleb.direction = [0.7, 0.2, 0.6] as V3;
      // AChA origin just distal to the neck.
      a.vessels.acha.origin = { parent: 'ica', t: 0.78, side: [0.7, -0.2, 0.7] };
      a.adhesions.count = 6;
      a.adhesions.spreadAlongNeck = 1.8;
    },
  },
} satisfies Record<string, CaseDef>;

export type CaseId = keyof typeof CASES;

function readCaseId(): CaseId {
  try {
    const id = new URLSearchParams(location.search).get('case');
    if (id && id in CASES) return id as CaseId;
  } catch {
    /* no URL (tests) */
  }
  return 'icpc';
}

/** The case in use for this page load. */
export const CURRENT_CASE: CaseId = readCaseId();

// Applied once, at import time, before any anatomy is built.
CASES[CURRENT_CASE].overrides(ANATOMY);

/** Switches case by reloading the page with ?case=… */
export function loadCase(id: CaseId): void {
  const url = new URL(location.href);
  url.searchParams.set('case', id);
  location.href = url.toString();
}
