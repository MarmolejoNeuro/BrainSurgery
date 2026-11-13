import * as THREE from 'three';

/**
 * Procedural instrument models. Convention: the working TIP is at the origin
 * and the shaft runs along local +Y. Jaws open along local X.
 */

const steel = new THREE.MeshStandardMaterial({ color: '#cfd3d6', metalness: 0.9, roughness: 0.3, envMapIntensity: 3 });
const darkSteel = new THREE.MeshStandardMaterial({ color: '#5d6266', metalness: 0.85, roughness: 0.4, envMapIntensity: 2 });
const blueGrip = new THREE.MeshStandardMaterial({ color: '#2a4a66', metalness: 0.3, roughness: 0.5 });

function cyl(r0: number, r1: number, len: number, mat: THREE.Material, y0 = 0): THREE.Mesh {
  const g = new THREE.CylinderGeometry(r1, r0, len, 16);
  g.translate(0, y0 + len / 2, 0);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

function shadowed(g: THREE.Group): THREE.Group {
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return g;
}

/** Frazee-type micro suction: fine tip, then a thicker barrel. */
export function suctionModel(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(0.55, 0.6, 22, steel));
  g.add(cyl(0.6, 1.3, 4, steel, 22));
  g.add(cyl(1.3, 1.3, 70, steel, 26));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.12, 8, 20), darkSteel);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  return shadowed(g);
}

/** Micro scissors: two short blades hinged at the shaft. */
export class ScissorsModel extends THREE.Group {
  private a = new THREE.Group();
  private b = new THREE.Group();
  constructor() {
    super();
    const blade = () => {
      const geo = new THREE.BoxGeometry(0.28, 4.5, 0.55, 1, 8, 1);
      geo.translate(0, 2.25, 0);
      // taper toward the tip
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const f = 0.35 + 0.65 * (p.getY(i) / 4.5);
        p.setZ(i, p.getZ(i) * f);
      }
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, steel);
    };
    const ba = blade(), bb = blade();
    ba.position.y = -4.5;
    bb.position.y = -4.5;
    this.a.add(ba);
    this.b.add(bb);
    this.a.position.y = 4.5;
    this.b.position.y = 4.5;
    this.add(this.a, this.b, cyl(0.7, 0.9, 70, steel, 4.5));
    this.setOpen(1);
    shadowed(this);
  }
  /** 0 = closed, 1 = open. */
  setOpen(o: number): void {
    const ang = 0.03 + o * 0.16;
    this.a.rotation.z = ang;
    this.b.rotation.z = -ang;
  }
}

/** Bipolar forceps: two tines whose tips close while coagulating. */
export class BipolarModel extends THREE.Group {
  private tines: THREE.Mesh[] = [];
  constructor() {
    super();
    for (const s of [-1, 1]) {
      const curve = new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 60, 0));
      const tine = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.4, 10), steel);
      tine.userData.side = s;
      // insulated (blue) proximal half
      const grip = cyl(0.55, 0.55, 40, blueGrip, 18);
      tine.add(grip);
      tine.castShadow = true;
      this.tines.push(tine);
      this.add(tine);
    }
    this.setGap(1);
  }
  /** Tip gap in mm. */
  setGap(gap: number): void {
    for (const t of this.tines) {
      const s = t.userData.side as number;
      t.position.x = (s * gap) / 2;
      // tines diverge toward the handle
      t.rotation.z = -s * 0.035;
    }
  }
}

/** Rhoton-type microdissector: fine shaft with a small round, slightly bent tip. */
export function dissectorModel(): THREE.Group {
  const g = new THREE.Group();
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), steel);
  tip.scale.set(1, 0.6, 1.3);
  g.add(tip);
  const neck = cyl(0.25, 0.35, 3, steel);
  neck.rotation.z = 0.35;
  g.add(neck);
  g.add(cyl(0.4, 0.8, 70, steel, 2.6));
  return shadowed(g);
}

/** Small spatula used to adjust retraction. */
export function spatulaCursorModel(): THREE.Group {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(3.5, 9, 0.3), steel);
  blade.position.y = 4.5;
  g.add(blade, cyl(0.6, 0.6, 60, steel, 9));
  return shadowed(g);
}

/** Micro Doppler probe: thin straight probe with a rounded tip. */
export function dopplerModel(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), darkSteel));
  g.add(cyl(0.5, 0.5, 18, steel));
  g.add(cyl(1.6, 1.6, 60, new THREE.MeshStandardMaterial({ color: '#d8d8d8', roughness: 0.5 }), 18));
  return shadowed(g);
}

/** 2.7 mm rigid endoscope with a 30° angled lens. */
export function endoscopeModel(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(1.35, 1.35, 90, steel, 0.4));
  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(1.2, 24),
    new THREE.MeshPhysicalMaterial({ color: '#0b1a2a', metalness: 0, roughness: 0.05, clearcoat: 1 }),
  );
  lens.rotation.x = Math.PI / 2 + 0.52;
  lens.position.y = 0.4;
  g.add(lens);
  return shadowed(g);
}

/* ------------------------------------------------------------------ */
/* ANEURYSM CLIPS                                                     */
/* ------------------------------------------------------------------ */

export type ClipVariant = 'straight' | 'curved';

export interface ClipOptions {
  variant: ClipVariant;
  /** Blade length in mm. */
  bladeLength: number;
  /** Tip opening in mm. */
  opening: number;
  color: string;
  ghost?: boolean;
}

/**
 * Yasargil-style clip: two blades meeting at a crossing, a spring coil and two
 * short back legs. Tips at the origin, blades along +Y, jaws close along X.
 * Curved blades bend sideways (along Z), out of the closing plane.
 */
export function buildClip(o: ClipOptions): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({
    color: o.color,
    metalness: 0.9,
    roughness: 0.25,
    envMapIntensity: 3,
    clearcoat: 0.5,
    transparent: !!o.ghost,
    opacity: o.ghost ? 0.5 : 1,
    depthWrite: !o.ghost,
  });
  const L = o.bladeLength;
  for (const s of [-1, 1]) {
    const geo = new THREE.BoxGeometry(0.4, L, 1.1, 1, 20, 1);
    geo.translate(0, L / 2, 0);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const f = 1 - y / L; // 1 at tip, 0 at hinge
      // jaw opening narrows linearly to the hinge
      p.setX(i, p.getX(i) + (s * o.opening * f) / 2 + s * 0.2);
      if (o.variant === 'curved') p.setZ(i, p.getZ(i) + 2.2 * f * f);
      // rounded tip
      if (y < 0.5) p.setZ(i, p.getZ(i) * (0.6 + y * 0.8));
    }
    geo.computeVertexNormals();
    const blade = new THREE.Mesh(geo, mat);
    blade.castShadow = !o.ghost;
    g.add(blade);
  }
  // Spring coil and back legs
  const coil = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.35, 10, 24), mat);
  coil.rotation.y = Math.PI / 2;
  coil.position.y = L + 1.9;
  g.add(coil);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 1.0), mat);
    leg.position.set(s * 0.9, L + 1.4, 0);
    leg.rotation.z = s * 0.22;
    g.add(leg);
  }
  g.traverse((ob) => {
    if ((ob as THREE.Mesh).isMesh) ob.castShadow = !o.ghost;
  });
  return g;
}
