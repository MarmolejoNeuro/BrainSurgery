import * as THREE from 'three';
import { mulberry32 } from './noise';

/** Canvas-generated textures, so the project ships without image assets. */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement, srgb = true, repeat: [number, number] = [1, 1]): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Recursive branching line, used for pial vessels and small arterioles. */
function branch(
  g: CanvasRenderingContext2D,
  rnd: () => number,
  x: number,
  y: number,
  angle: number,
  width: number,
  len: number,
  depth: number,
): void {
  if (depth <= 0 || width < 0.35) return;
  let cx = x, cy = y, a = angle;
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(cx, cy);
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    a += (rnd() - 0.5) * 0.6;
    cx += Math.cos(a) * (len / steps);
    cy += Math.sin(a) * (len / steps);
    g.lineTo(cx, cy);
    if (rnd() < 0.22) branch(g, rnd, cx, cy, a + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.6), width * 0.62, len * 0.6, depth - 1);
  }
  g.stroke();
  branch(g, rnd, cx, cy, a + (rnd() - 0.5) * 0.4, width * 0.8, len * 0.8, depth - 1);
}

/**
 * Pial surface: the brain's surface is covered by pia with a fine network of
 * small arteries and veins. White background so it multiplies with vertex colors.
 */
export function makePialTexture(seed = 7): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 1024);
  const rnd = mulberry32(seed);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 1024, 1024);
  // blotchy translucency
  for (let i = 0; i < 260; i++) {
    const r = 20 + rnd() * 70;
    g.fillStyle = `rgba(${200 + rnd() * 40},${150 + rnd() * 40},${140 + rnd() * 40},0.06)`;
    g.beginPath();
    g.arc(rnd() * 1024, rnd() * 1024, r, 0, Math.PI * 2);
    g.fill();
  }
  g.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const vein = rnd() < 0.35;
    g.strokeStyle = vein ? 'rgba(110,60,95,0.55)' : 'rgba(165,40,40,0.6)';
    branch(g, rnd, rnd() * 1024, rnd() * 1024, rnd() * Math.PI * 2, 2.2 + rnd() * 2.6, 110 + rnd() * 120, 6);
  }
  return toTexture(c, true, [2, 1]);
}

/** Fine collagen-fibre texture for the arachnoid (used as alpha). */
export function makeArachnoidTexture(seed = 11): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const rnd = mulberry32(seed);
  g.fillStyle = '#5a5a5a';
  g.fillRect(0, 0, 512, 512);
  g.lineCap = 'round';
  for (let i = 0; i < 1400; i++) {
    const a = rnd() * Math.PI;
    const x = rnd() * 512, y = rnd() * 512, l = 20 + rnd() * 90;
    const v = 120 + rnd() * 135;
    g.strokeStyle = `rgba(${v},${v},${v},${0.12 + rnd() * 0.25})`;
    g.lineWidth = 0.4 + rnd() * 1.4;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + 0.4) * l * 0.5, y + Math.sin(a + 0.4) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  // a few trabeculae (thicker strands)
  for (let i = 0; i < 30; i++) {
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1.5 + rnd() * 2;
    g.beginPath();
    const x = rnd() * 512, y = rnd() * 512;
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 160, y + (rnd() - 0.5) * 160);
    g.stroke();
  }
  return toTexture(c, false, [1, 1]);
}

/** Longitudinal fascicle striations for cranial nerves (u = along the nerve). */
export function makeNerveTexture(seed = 5): THREE.CanvasTexture {
  const [c, g] = canvas(512, 256);
  const rnd = mulberry32(seed);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 512, 256);
  for (let y = 0; y < 256; y += 2) {
    const v = 215 + rnd() * 40;
    g.fillStyle = `rgba(${v},${v - 8},${v - 25},0.6)`;
    g.fillRect(0, y, 512, 1 + rnd() * 2);
  }
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(170,50,50,0.55)';
  for (let i = 0; i < 6; i++) branch(g, rnd, rnd() * 512, rnd() * 256, (rnd() - 0.5) * 0.4, 1.4, 140, 3);
  return toTexture(c, true, [2, 1]);
}

/** Subtle vessel-wall texture (vasa vasorum and wall sheen variation). */
export function makeVesselTexture(seed = 9): THREE.CanvasTexture {
  const [c, g] = canvas(512, 128);
  const rnd = mulberry32(seed);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 120; i++) {
    g.fillStyle = `rgba(255,${200 + rnd() * 55},${200 + rnd() * 55},0.15)`;
    g.fillRect(rnd() * 512, rnd() * 128, 10 + rnd() * 50, 2 + rnd() * 6);
  }
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(120,20,25,0.35)';
  for (let i = 0; i < 10; i++) branch(g, rnd, rnd() * 512, rnd() * 128, (rnd() - 0.5) * 1.5, 0.9, 60, 3);
  return toTexture(c, true, [3, 1]);
}
