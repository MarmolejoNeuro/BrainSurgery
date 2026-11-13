/** Simulation parameters (physiology, camera, rendering). Illustrative, not clinical. */
export const SIM = {
  heart: {
    baselineHR: 68,
  },
  /**
   * Physiology (illustrative numbers, simplified for teaching).
   * Blood loss lowers arterial pressure and raises heart rate; temporary ICA
   * occlusion is tolerated for a few minutes (collaterals) before MEPs fall;
   * occluding the anterior choroidal artery drops MEPs within about a minute.
   */
  physiology: {
    baselineSys: 124,
    baselineDia: 74,
    baselineSpO2: 99,
    /** Blood loss (ml) at which the full hypovolemic response is reached. */
    severeLossMl: 1500,
    /** Seconds of reduced distal ICA flow before MEPs start to fall. */
    icaIschemiaTolerance: 300,
    /** MEP fall per second once beyond tolerance (%). */
    icaMepFallPerSec: 0.15,
    /** Seconds of AChA occlusion before MEPs fall (no collaterals). */
    achaIschemiaTolerance: 45,
    achaMepFallPerSec: 1.2,
    alarms: { mapLow: 60, hrHigh: 120, spo2Low: 90, mepLow: 50, occlusionLong: 600 },
  },
  bleeding: {
    /** Arterial jet from a ruptured aneurysm at normal pressure (ml/s). */
    ruptureRate: 7,
    /** Side-wall injury of a major artery (ml/s). */
    briskRate: 1.0,
    /** Small vessel/vein ooze (ml/s); decays on its own with this half-life (s). */
    oozeRate: 0.18,
    oozeHalfLife: 70,
    /** Chance that opening a fissure segment tears a small bridging vessel. */
    oozeChanceOnCut: 0.25,
    /** Suction capacity (ml/s). */
    suctionRate: 6,
    /** Effective horizontal area of the deep field (mm²): sets how fast blood pools. */
    poolArea: 900,
    /** Pool starts at this height (skull base) and can rise to poolMaxY. */
    poolBaseY: -15,
    poolMaxY: 3,
    /** Rupture: hidden risk above this starts a probabilistic rupture. */
    ruptureThreshold: 0.55,
  },
  microscope: {
    /** Working distance of the objective (mm). Real microscopes: ~200-300 mm. */
    workingDistance: 250,
    /** Field diameter at 1x would be this / magnification (mm). */
    fieldAt1x: 200,
    minMag: 3,
    maxMag: 16,
    initialMag: 4.5,
    /** Max tilt of the optical axis from vertical (degrees). */
    maxTilt: 55,
    initialTilt: 22,
    /** Initial azimuth (degrees): 0 = from lateral (+X), -90 = from anterior (-Z). */
    initialAzimuth: 10,
    initialTarget: [3, -4, 1] as [number, number, number],
    /** Target pan bounds (mm). */
    bounds: { min: [-20, -14, -14] as [number, number, number], max: [30, 10, 16] as [number, number, number] },
    damping: 10,
  },
  procedure: {
    /** Fraction of neck adhesions that must be freed before clipping is considered safe. */
    neckClearanceNeeded: 0.75,
  },
  render: {
    dof: true,
    /** Depth-of-field range (mm) at 1x; divided by magnification. */
    dofRangeAt1x: 40,
    bokehScale: 2.2,
    bloom: 0.35,
    lightColor: '#ffeedd',
    lightIntensity: 3.0,
  },
};
