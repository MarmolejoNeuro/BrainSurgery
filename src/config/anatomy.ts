/**
 * ANATOMY CONFIGURATION — the one file to tune sizes, positions and colors.
 *
 * Units: 1 scene unit = 1 millimetre.
 *
 * Coordinate frame ("surgical field frame", right pterional view):
 *   +X = lateral  (toward the patient's right side / the surgeon's working corridor)
 *   -X = medial   (toward the midline: optic chiasm, A1 heading to the AComm)
 *   +Y = superficial (toward the microscope)
 *   -Y = deep      (toward the skull base)
 *   -Z = anterior / frontal side of the sylvian fissure (top of the screen)
 *   +Z = posterior / temporal side of the fissure (bottom of the screen)
 *
 * (X, Y, Z) is right-handed, so with the microscope looking down -Y and the
 * frontal lobe at the top of the image, lateral appears on the screen RIGHT and
 * medial on the LEFT, as in a real right pterional view.
 *
 * The anatomy is SCHEMATIC and for education only. Proportions roughly follow
 * typical adult values but are deliberately simplified.
 */

export type V3 = [number, number, number];

/** A vessel can start at a point on another vessel (e.g. PCom arises from the ICA). */
export interface VesselOrigin {
  parent: string; // id of parent vessel
  t: number; // 0..1 position along the parent spline
  /** Offset direction (field frame) from the parent's centreline, scaled by parent radius. */
  side?: V3;
}

export interface VesselDef {
  label: string;
  /** Radius in mm at the start and end (diameter = 2 x radius). */
  radius: [number, number];
  color: string;
  origin?: VesselOrigin;
  /** Spline control points. If `origin` is set, the origin point is prepended automatically. */
  points: V3[];
  /** Pulsation amplitude in mm (radial). */
  pulse: number;
  isVein?: boolean;
}

export const ANATOMY = {
  /* ------------------------------------------------------------------ */
  /* SYLVIAN FISSURE AND LOBES                                           */
  /* ------------------------------------------------------------------ */
  fissure: {
    /** Z position of the fissure midline. */
    centerZ: 1,
    /** Half-width of the closed fissure (mm). Arachnoid bridges this gap. */
    baseHalfGap: 0.8,
    /** Extra opening per side at full retraction (mm). */
    maxRetraction: 7.5,
    /** Initial retraction 0..1. The fissure starts nearly closed; open the arachnoid first. */
    initialRetraction: 0.12,
    /**
     * Retraction allowed with the superficial arachnoid intact. The rest unlocks
     * as fissure segments are cut (an unopened fissure cannot be split safely).
     */
    retractionWhenClosed: 0.22,
    /** Above this retraction, "retraction pressure" accumulates (brain injury risk). */
    safeRetraction: 0.85,
  },

  /**
   * Lobes are built as "superellipsoids" (rounded boxes) with gyral noise.
   * The face toward the fissure sits at the fissure edge; center is [x, y].
   */
  frontalLobe: {
    // Frontal operculum + orbital surface. Lies ABOVE the ICA and optic nerve.
    center: [2, 5] as [number, number],
    radii: [36, 11, 24] as V3,
    exponent: 2.8,
    gyralAmplitude: 1.0,
    gyralScale: 0.11,
    color: '#d6a196',
  },
  temporalLobe: {
    // Temporal operculum. The uncus (medial temporal lobe) sits near CN III.
    center: [12, 2] as [number, number],
    radii: [30, 12, 20] as V3,
    exponent: 2.8,
    gyralAmplitude: 1.0,
    gyralScale: 0.11,
    color: '#d3a093',
  },

  /** Deep floor of the field (dura over the skull base, anterior clinoid region). */
  skullBase: { y: -15.5, color: '#2c1a18' },

  /* ------------------------------------------------------------------ */
  /* ARTERIES (built as tapered tubes along Catmull-Rom splines)         */
  /* ------------------------------------------------------------------ */
  vessels: {
    /**
     * Supraclinoid internal carotid artery. It leaves the dural ring next to the
     * anterior clinoid process and runs posteriorly, superiorly and laterally to
     * its terminal bifurcation into M1 and A1. Typical diameter ~4 mm.
     */
    ica: {
      label: 'ICA',
      radius: [2.05, 1.9],
      color: '#b8322c',
      points: [
        [-4, -11, -9],
        [-3, -8.5, -5.5],
        [-1.5, -6.5, -2],
        [0.5, -5, 1.5],
        [2.5, -3.5, 4],
        [4, -2.5, 5.5],
      ],
      pulse: 0.07,
    },
    /**
     * M1 (sphenoidal segment of the MCA): runs laterally deep in the sylvian
     * fissure. Lenticulostriate perforators arise from its posterior-superior wall.
     */
    m1: {
      label: 'M1',
      radius: [1.5, 1.35],
      color: '#bb3530',
      origin: { parent: 'ica', t: 1 },
      points: [
        [8, -1.6, 3.6],
        [13, -1, 2.6],
        [18, -0.5, 2],
      ],
      pulse: 0.05,
    },
    /** Superior M2 trunk: climbs along the frontal (insular) side. */
    m2sup: {
      label: 'M2 sup',
      radius: [1.1, 0.95],
      color: '#bd3732',
      origin: { parent: 'm1', t: 1 },
      points: [
        [22, 1, 1.5],
        [26, 3, -1.5],
        [31, 4.5, -3],
      ],
      pulse: 0.04,
    },
    /** Inferior M2 trunk: runs along the temporal side. */
    m2inf: {
      label: 'M2 inf',
      radius: [1.05, 0.9],
      color: '#bd3732',
      origin: { parent: 'm1', t: 1 },
      points: [
        [22, 0, 7],
        [27, 2, 10],
        [32, 3.5, 12],
      ],
      pulse: 0.04,
    },
    /** A1 (precommunicating ACA): runs medially over the optic nerve/chiasm. */
    a1: {
      label: 'A1',
      radius: [1.05, 0.95],
      color: '#b8342e',
      origin: { parent: 'ica', t: 1 },
      points: [
        [1, -1.4, 6.5],
        [-4, -1.2, 7.5],
        [-10, -1.8, 7],
        [-17, -3, 5.5],
      ],
      pulse: 0.04,
    },
    /**
     * Posterior communicating artery: arises from the POSTEROMEDIAL wall of the
     * ICA and runs posteriorly and medially, above CN III, to join the PCA.
     * The IC-PC aneurysm sits at this branching point. ~1.2 mm diameter.
     */
    pcom: {
      label: 'PCom',
      radius: [0.65, 0.55],
      color: '#b23a33',
      origin: { parent: 'ica', t: 0.52, side: [-0.6, -0.4, 0.7] },
      points: [
        [-2.5, -8, 5],
        [-4.5, -9.5, 9],
        [-6, -10.5, 14],
      ],
      pulse: 0.025,
    },
    /**
     * Anterior choroidal artery: arises a few mm DISTAL to the PCom from the
     * posterior wall and runs posterolaterally toward the choroidal fissure.
     * Small (~0.8 mm) but critical: occlusion can cause hemiplegia.
     */
    acha: {
      label: 'AChA',
      radius: [0.42, 0.36],
      color: '#b43c35',
      origin: { parent: 'ica', t: 0.72, side: [0.7, -0.2, 0.7] },
      points: [
        [5, -4.2, 5.2],
        [8.5, -4.8, 7.5],
        [12, -5.5, 10.5],
      ],
      pulse: 0.02,
    },
  } satisfies Record<string, VesselDef>,

  /** Superficial sylvian vein, draped on the temporal lobe edge of the fissure. */
  superficialSylvianVein: {
    color: '#5b3b5e',
    radius: 0.9,
    /** Distance from the fissure edge onto the temporal surface (mm). */
    offsetFromEdge: 2.2,
    fromX: -2,
    toX: 36,
  },

  /* ------------------------------------------------------------------ */
  /* ANEURYSM                                                            */
  /* ------------------------------------------------------------------ */
  aneurysm: {
    /** Position of the neck along the ICA spline (same level as the PCom origin). */
    icaT: 0.5,
    /** Maximum dome diameter (mm). */
    diameter: 6.6,
    /** Neck width (mm). */
    neckWidth: 4.0,
    /** Short neck length before the dome flares (mm). */
    neckLength: 0.8,
    /**
     * Projection direction: POSTEROLATERAL and INFERIOR (pointing toward the
     * tentorial edge / CN III). Field frame vector, normalized at runtime.
     */
    projection: [0.75, -0.75, 0.7] as V3,
    /** Small daughter sac (bleb) on the dome: the most fragile spot. */
    bleb: {
      radius: 0.9,
      /** Direction from dome center, field frame, normalized at runtime. */
      direction: [0.9, -0.2, 0.4] as V3,
    },
    colorBase: '#b3352f',
    colorDome: '#d0605a',
    colorBleb: '#7a1f2a',
    pulse: 0.12,
  },

  /** Arachnoid bands tethering the neck; the dissector frees them. */
  adhesions: {
    count: 8,
    /** Band length (mm) from the neck to its anchor. */
    length: 2.6,
    radius: 0.12,
    /** How far up the neck/dome the bands attach (mm from the neck plane). */
    spreadAlongNeck: 2.2,
    /** Arc around the neck (degrees, centred on the side facing the microscope). */
    arcDegrees: 240,
  },

  /* ------------------------------------------------------------------ */
  /* CRANIAL NERVES                                                      */
  /* ------------------------------------------------------------------ */
  nerves: {
    /**
     * Optic nerve (CN II): MEDIAL to the ICA, running from the optic canal
     * posteromedially to the chiasm. The ICA is lateral to it ("opticocarotid
     * triangle" lies between them).
     */
    optic: {
      label: 'CN II',
      radius: 2.0,
      flatten: 0.65,
      color: '#e8dcc4',
      points: [
        [-9, -10.5, -13],
        [-10, -9.5, -6],
        [-13, -9, 0],
        [-19, -9, 3],
      ] as V3[],
    },
    /**
     * Oculomotor nerve (CN III): runs below and lateral to the PCom toward the
     * cavernous sinus. An expanding IC-PC aneurysm can compress it (third-nerve palsy).
     */
    oculomotor: {
      label: 'CN III',
      radius: 1.1,
      flatten: 0.9,
      color: '#e6d9c0',
      points: [
        [-6, -12.6, 17],
        [-3.5, -12.4, 9],
        [-1.5, -12.2, 2],
        [0, -12.5, -5],
      ] as V3[],
    },
  },

  /* ------------------------------------------------------------------ */
  /* ARACHNOID MEMBRANES                                                 */
  /* ------------------------------------------------------------------ */
  arachnoid: {
    /** Number of cuttable segments bridging the superficial fissure. */
    fissureSegments: 9,
    fromX: -4,
    toX: 32,
    /** How far each sheet tucks under the lobe edges (mm). */
    overlap: 2.0,
    /** Sag of the sheet toward the depth of the fissure (mm). */
    sag: 1.2,
    opacity: 0.16,
    color: '#f2ece6',
    /**
     * Deep cistern membranes (cuttable patches). center, size [w, h], rotation
     * (Euler XYZ, radians) relative to a horizontal patch.
     */
    cisterns: [
      // Carotid cistern: over the ICA, lateral to the optic nerve.
      { id: 'carotid', center: [-2.5, -3.2, -3] as V3, size: [10, 8] as [number, number], rot: [-0.15, 0, 0.2] as V3 },
      // Membrane over the IC-PC region / aneurysm neck (adhesions to dissect).
      { id: 'icpc', center: [1.5, -3.8, 3.5] as V3, size: [9, 7] as [number, number], rot: [0.25, 0, -0.1] as V3 },
      // Proximal sylvian (deep) arachnoid over M1.
      { id: 'proxSylvian', center: [10, 0.2, 4.5] as V3, size: [10, 6] as [number, number], rot: [0, 0, 0.05] as V3 },
      // Chiasmatic cistern over the optic nerve.
      { id: 'chiasmatic', center: [-11, -5.5, -3] as V3, size: [9, 10] as [number, number], rot: [0, 0, 0] as V3 },
    ],
  },

  /* ------------------------------------------------------------------ */
  /* BRAIN SPATULAS (self-retaining retractors)                          */
  /* ------------------------------------------------------------------ */
  spatulas: {
    width: 5,
    length: 26,
    thickness: 0.35,
    /** Tip depth (y) and x position along the fissure; tilt leans the blade over the lobe. */
    frontal: { x: 9, tipY: -1.5, tilt: 0.42 },
    temporal: { x: 13, tipY: -3, tilt: 0.4 },
  },

  /* ------------------------------------------------------------------ */
  /* PULSATION                                                           */
  /* ------------------------------------------------------------------ */
  pulsation: {
    /** Transmitted brain pulsation (mm). */
    brain: 0.05,
  },
};

export type AnatomyConfig = typeof ANATOMY;
