import './ui/styles.css';
import * as THREE from 'three';
import { Anatomy } from './anatomy';
import { Adhesions } from './anatomy/adhesions';
import { pulseUniform } from './anatomy/materials';
import { audio } from './audio/engine';
import { bus } from './core/events';
import { applyDom, onLangChange, type I18nKey } from './core/i18n';
import { state, tempOcclusionSeconds } from './core/store';
import { BleedingSystem } from './physics/bleeding';
import { Heart } from './physics/heart';
import { FlowModel } from './physics/flow';
import { Physiology } from './physics/physiology';
import { ClipCheck } from './procedure/clipCheck';
import { DemoDirector } from './procedure/demo';
import { buildDebrief } from './procedure/scoring';
import { StageManager } from './procedure/manager';
import { EndoscopeView } from './scene/endoscopeView';
import { IcgView } from './scene/icg';
import { MicroscopeLight } from './scene/lighting';
import { MicroscopeCamera } from './scene/microscope';
import { MicroscopePost } from './scene/postfx';
import { createRenderer } from './scene/renderer';
import { Effects } from './tools/effects';
import { ToolManager } from './tools/manager';
import { Checklist } from './ui/checklist';
import { DebriefScreen } from './ui/debrief';
import { DemoBanner } from './ui/demoBanner';
import { ClipCheckPanel } from './ui/clipCheck';
import { Hud } from './ui/hud';
import { MentorPanel } from './ui/mentor';
import { createStartScreen } from './ui/startScreen';
import { createToasts } from './ui/toasts';
import { Toolbar } from './ui/toolbar';
import { TunePanel } from './ui/tunePanel';
import { VitalsPanel } from './ui/vitals';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;

// ---------- Scene ----------
const { renderer, scene } = createRenderer(canvas);
const scope = new MicroscopeCamera(canvas);
const light = new MicroscopeLight(scene);
const post = new MicroscopePost(renderer, scene, scope.camera);
const heart = new Heart();
const anatomy = new Anatomy();
const adhesions = new Adhesions(anatomy.aneurysm, anatomy.vessels.get('ica')!);
const fx = new Effects();
const physiology = new Physiology(heart);
const blood = new BleedingSystem(anatomy, heart);
const flow = new FlowModel(anatomy);
const clipCheck = new ClipCheck(flow);
const placed = new THREE.Group();
scene.add(anatomy.root, adhesions.group, fx.group, placed, blood.group);
// ICG: the sac below the clip line still fills when the clip leaves a residual neck.
const icg = new IcgView(anatomy, [anatomy.arachnoid.group, adhesions.group, fx.group], () => {
  const a = flow.assessment;
  return a.clipped && a.best && a.best.coverage > 0.5 ? Math.max(0, a.best.height) : 0;
});


const endoView = new EndoscopeView(scene, uiRoot);

// ---------- Instruments ----------
const tools = new ToolManager({ anatomy, adhesions, scope, scene, heart, fx, placed, blood }, canvas, {
  highlight: (objs, cls) => post.setHighlight(objs, cls),
  toggleIcg: () => {
    state.icgOn = icg.toggle();
    post.setIcgMode(state.icgOn);
    bus.emit('icg:toggle', { on: state.icgOn });
    bus.emit('toast', { key: state.icgOn ? 'toast.icgOn' : 'toast.icgOff', level: 'info' });
  },
});
scope.wheelInterceptor = (e) => tools.wheel(e);

// ---------- UI ----------
let tune: TunePanel;
const hud = new Hud(uiRoot, () => tune.toggle(), () => toggleDemo(), () => openDebrief());
tune = new TunePanel(uiRoot, {
  retraction: { get: () => anatomy.retraction, set: (v) => anatomy.setRetraction(v) },
  heartRate: { get: () => physiology.baselineHR, set: (v) => (physiology.baselineHR = v) },
  arachnoid: { get: () => anatomy.arachnoid.material.opacity, set: (v) => anatomy.arachnoid.setOpacity(v) },
  bloom: { get: () => post.bloom.intensity, set: (v) => (post.bloom.intensity = v) },
  light: { get: () => light.spot.intensity, set: (v) => (light.spot.intensity = v) },
  lobes: { get: () => anatomy.frontal.visible, set: (v) => anatomy.setLobesVisible(v) },
  dof: { get: () => true, set: (v) => post.setDof(v) },
});
tune.addReadout('tune.risk', () => state.ruptureRisk.toFixed(2));
tune.addReadout('tune.clearance', () => `${Math.round(state.neckClearance * 100)}%`);
tune.addReadout('tune.stress', () => state.retractionStress.toFixed(1));
const toolbar = new Toolbar(uiRoot, (id) => tools.setTool(id), () => tools.clip.variant);
createToasts(uiRoot);
const vitals = new VitalsPanel(uiRoot, heart);
const stages = new StageManager(anatomy, clipCheck);

// Left column: procedure checklist, then the clip check (stacked, never overlapping).
const leftCol = document.createElement('div');
leftCol.className = 'left-col';
uiRoot.append(leftCol);
const checklist = new Checklist(leftCol, stages);
const clipPanel = new ClipCheckPanel(leftCol, clipCheck);
const mentor = new MentorPanel(uiRoot, stages, (id) => tools.setTool(id), () => openDebrief());

// ---------- Debrief and demo mode ----------
const debrief = new DebriefScreen(uiRoot);
function openDebrief(): void {
  if (demo.running) demo.stop();
  debrief.show(() => buildDebrief(flow.assessment, clipCheck, stages));
}
const demo = new DemoDirector({ anatomy, adhesions, scope, tools, stages, endoView, canvas });
new DemoBanner(uiRoot, demo);
function toggleDemo(): void {
  if (demo.running && !demo.paused) demo.stop();
  else demo.start();
}
// Offer the debrief once, when the last stage completes.
bus.on('procedure:complete', () => setTimeout(() => !debrief.open && openDebrief(), demo.running ? 2500 : 1500));

onLangChange(() => {
  applyDom(uiRoot);
  hud.refreshLang();
  toolbar.refresh();
  checklist.render(true);
  mentor.render(true);
  clipPanel.render(true);
  vitals.refreshLabels();
  if (debrief.open) debrief.render();
});
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
  if (e.key === 't' || e.key === 'T') tune.toggle();
  if (e.key === 'h' || e.key === 'H') hud.toggleHelp();
});
createStartScreen(uiRoot, (watchDemo) => {
  audio.init(); // Web Audio must start from a user gesture
  canvas.focus();
  if (watchDemo) setTimeout(() => demo.start(), 700);
});

// ---------- Hover label, double-click focus ----------
canvas.addEventListener('pointerleave', () => hud.setHover(null));
canvas.addEventListener('dblclick', () => {
  if (tools.hit && !tools.active) scope.focusOn(tools.hit.point);
});

// ---------- Resize ----------
function resize(): void {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  post.setSize(w, h);
  scope.setAspect(w / h);
}
window.addEventListener('resize', resize);
resize();

// ---------- Main loop ----------
const clock = new THREE.Clock();
let uiTimer = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  state.elapsed += dt;
  heart.update(dt);
  pulseUniform.value = heart.pulse;
  scope.update(dt);
  light.follow(scope.camera, scope.focalPoint);
  post.setFocus(scope.focalPoint, scope.displayedMag);

  demo.update();
  tools.update(dt);
  anatomy.update(dt);
  adhesions.update(dt);
  fx.update(dt);
  icg.update(dt);
  stages.update(dt);
  physiology.update(dt);
  blood.update(dt);
  vitals.frame(dt);

  uiTimer += dt;
  if (uiTimer > 0.1) {
    uiTimer = 0;
    hud.setHover((tools.hit?.object.userData.labelKey as I18nKey) ?? null);
    hud.update(scope.displayedMag, scope.fieldDiameter, heart.hr, tempOcclusionSeconds());
    tune.refresh();
    checklist.render();
    mentor.render();
    vitals.update();
    clipPanel.render();
  }

  post.render(dt);

  // Endoscope picture-in-picture (no microscope post-processing on it).
  const endo = tools.endoscope;
  if (endo.showPip) endoView.setPose(endo.lensPos, endo.lookAt);
  endoView.render(renderer, scene, endo.showPip);
  if (endo.showPip) endoSight(dt);
});

// ---------- Endoscope sightings ----------
// Looking behind the dome with the endoscope confirms the AChA and PCom origins,
// and after clipping shows whether the blades cross the whole neck.
let sightTimer = 0;
const sightHold = new Map<string, number>();
function endoSight(dt: number): void {
  sightTimer += dt;
  if (sightTimer < 0.25) return;
  const step = sightTimer;
  sightTimer = 0;
  const roots = [anatomy.root, placed];
  const targets: [string, THREE.Vector3][] = [
    ['acha', anatomy.vessels.get('acha')!.curve.getPointAt(0.2)],
    ['pcom', anatomy.vessels.get('pcom')!.curve.getPointAt(0.15)],
    ['neck', anatomy.aneurysm.neckCenter],
  ];
  for (const [id, p] of targets) {
    const visible = id === 'neck' ? neckRing().some((q) => endoView.sees(q, roots, 1.5)) : endoView.sees(p, roots, 1.2);
    const held = visible ? (sightHold.get(id) ?? 0) + step : 0;
    sightHold.set(id, held);
    if (held >= 1) {
      sightHold.set(id, -1e9); // report once per placement
      bus.emit('endoscope:sighted', { id });
    }
  }
}
/** Points just outside the neck wall, all around it (the neck centre itself is inside the vessel). */
function neckRing(): THREE.Vector3[] {
  const an = anatomy.aneurysm;
  const u = new THREE.Vector3(0, 1, 0).addScaledVector(an.axis, -an.axis.y).normalize();
  const w = new THREE.Vector3().crossVectors(an.axis, u);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    pts.push(an.neckCenter.clone().addScaledVector(an.axis, 0.6).addScaledVector(u, Math.cos(a) * an.neckRadius).addScaledVector(w, Math.sin(a) * an.neckRadius));
  }
  return pts;
}
bus.on('endoscope:parked', () => sightHold.clear());
bus.on('clip:applied', () => sightHold.clear());

// Debug handle for the browser console during development.
if (import.meta.env.DEV) Object.assign(window, { __sim: { anatomy, adhesions, scope, heart, post, scene, renderer, tools, state, icg, stages, endoView, bus, endoSight, blood, physiology, vitals, checklist, mentor, hud, flow, clipCheck, clipPanel, demo, debrief, openDebrief } });
