import * as THREE from 'three';

export interface TubeOptions {
  /** Radius as a function of t in [0, 1]. */
  radius: (t: number) => number;
  /** Vertical squash (1 = round). Nerves are slightly flattened. */
  flatten?: number;
  tubularSegments?: number;
  radialSegments?: number;
}

/**
 * Tube along a curve with variable radius and optional flattening.
 * (THREE.TubeGeometry has a constant radius, vessels taper.)
 * Normals are radial, which the pulsation shader relies on.
 */
export function buildTube(curve: THREE.Curve<THREE.Vector3>, opts: TubeOptions): THREE.BufferGeometry {
  const tubular = opts.tubularSegments ?? Math.max(24, Math.round(curve.getLength() * 3));
  const radial = opts.radialSegments ?? 24;
  const flatten = opts.flatten ?? 1;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Parallel-transport frames avoid twisting.
  const frames = curve.computeFrenetFrames(tubular, false);
  const P = new THREE.Vector3();
  const n = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();

  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, P);
    const T = frames.tangents[i];
    // Reference "up" so flattening is always in the vertical direction.
    if (flatten !== 1 && Math.abs(T.dot(worldUp)) < 0.95) {
      N.copy(worldUp).addScaledVector(T, -T.dot(worldUp)).normalize();
      B.crossVectors(T, N).normalize();
    } else {
      N.copy(frames.normals[i]);
      B.copy(frames.binormals[i]);
    }
    const r = opts.radius(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      positions.push(
        P.x + r * (c * B.x + s * N.x * flatten),
        P.y + r * (c * B.y + s * N.y * flatten),
        P.z + r * (c * B.z + s * N.z * flatten),
      );
      n.set(0, 0, 0).addScaledVector(B, c).addScaledVector(N, s / flatten).normalize();
      normals.push(n.x, n.y, n.z);
      uvs.push(t * curve.getLength() / 10, j / radial);
    }
  }
  for (let i = 0; i < tubular; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = (i + 1) * (radial + 1) + j;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

export const v3 = (a: readonly number[]) => new THREE.Vector3(a[0], a[1], a[2]);
