# IC-PC Aneurysm Clipping Simulator: Plan

> Educational and demonstration use only. Not clinical training, not medical advice.
> This notice appears on the start screen and in the debrief.

## 1. Goal

A browser-only simulator of microsurgical clipping of a **right IC-PC (internal carotid to posterior communicating) aneurysm** through a **pterional, transsylvian** approach. The view looks like an operating microscope: warm light, vignette, shallow depth of field, glossy tissue.

## 2. Stack

| Concern | Choice |
|---|---|
| Build | Vite + TypeScript (strict) |
| 3D | Three.js |
| Post-processing | `postprocessing` (pmndrs): Vignette, DepthOfField, Bloom, plus a custom warm tone/LUT pass |
| Audio | Web Audio API, all sounds synthesized (no audio files) |
| State | Plain TypeScript store with a typed event bus, in memory, no backend |
| UI | DOM overlay with plain TS and CSS (no framework), dark OR-display style |
| i18n | Simple key dictionary `en.ts` / `es.ts`, toggled live |

Three.js plus `postprocessing` are the only runtime dependencies.

## 3. Folder layout

```
src/
  main.ts                  boot, start screen, main loop
  config/anatomy.ts        ALL anatomy sizes, positions, colors (the file you tune)
  config/sim.ts            physiology, bleeding, scoring thresholds
  core/                    store.ts, events.ts, loop.ts, i18n/ (en.ts, es.ts)
  scene/                   renderer, microscope camera + controls, lighting, postfx, ICG mode
  anatomy/                 brain lobes, sylvian fissure, arachnoid, vessels, nerves, aneurysm, materials, pulsation
  tools/                   Tool base class, one file per tool, cursor models, ToolManager
  procedure/               stage definitions, goal checks, StageManager, demo-mode scripts
  physics/                 bleeding sources, blood particles, pooling layer, rupture risk, clip fit evaluation, flow model
  audio/                   Doppler synth, alarms, ambient monitor beeps
  ui/                      toolbar, checklist, mentor, vitals + ECG, PiP endoscope, start screen, debrief, styles.css
```

## 4. Anatomy (procedural, right side, surgeon's view)

All values live in `config/anatomy.ts` with learner-oriented comments. Units: **1 scene unit = 1 mm**, so the 6.6 mm aneurysm is literally 6.6 units.

- **Frontal and temporal lobes**: displaced, noise-deformed sphere segments with sulcal texture, separated by the **sylvian fissure**.
- **Arachnoid**: semi-transparent membrane patches bridging the fissure and the basal cisterns (carotid, chiasmatic, around PCom). Each is a set of segments that can be cut individually.
- **Vessels**: `TubeGeometry` along Catmull-Rom splines, with radius tapering per vessel:
  ICA (supraclinoid) → bifurcation → **M1** → M2 superior/inferior trunks; **A1**; **PCom** arising posteromedially from the ICA; **anterior choroidal artery** arising just distal to the PCom.
- **Nerves**: optic nerve (medial to the ICA), oculomotor nerve (CN III, below and lateral to the PCom, the classic reason an IC-PC aneurysm can cause a third-nerve palsy).
- **Aneurysm**: 6.6 mm dome at the IC-PC junction, projecting **posterolaterally and inferiorly**, with a defined neck and a small **bleb** on the dome (the likely rupture point).
- **Materials**: `MeshPhysicalMaterial` with clearcoat for a moist look; vessels red/pink, veins bluish, nerves off-white.
- **Pulsation**: vertex-shader radial scaling on arteries and the dome, driven by the live heart rate (systolic upstroke, diastolic decay).
- **Brain spatulas**: retractor blades on the frontal and temporal lobes. Lobe vertices near a blade are pushed away (simple deformation), so retraction visibly opens the fissure.

Camera: a microscope rig orbiting a focal point with limited angles (it cannot go behind the anatomy), mouse wheel for zoom (magnification 4x to 16x shown in the HUD), and the right mouse button to pan. Depth of field focuses on the point under the cursor or on the active target.

## 5. Tools (bottom toolbar, keys 1 to 0)

| Key | Tool | Interaction rule |
|---|---|---|
| 1 | Suction | Hold to remove blood particles and lower the pool under the tip. Too close to the dome adds rupture risk. |
| 2 | Micro scissors | Click an arachnoid segment to cut it. Clicking a vessel causes a small bleed. |
| 3 | Bipolar forceps | Hold on an oozing point for about 1 s to coagulate it. Has no effect on arterial rupture. |
| 4 | Dissector | Drag along the aneurysm neck to free adhesions (neck-clearance %). Rough or fast strokes on the dome add rupture risk. |
| 5 | Brain spatula | Drag to adjust retraction depth. Over-retraction raises a "retraction pressure" penalty. |
| 6 | Aneurysm clip | Choose straight or curved (Tab). Move to place, Q/E to rotate, mouse wheel for blade depth, click to apply. A ghost preview shows blade lines. |
| 7 | ICG angiography | Toggles a fluorescence view: filled vessels glow, unfilled ones stay dark, with arterial-phase timing. |
| 8 | Micro Doppler | Touch a vessel: pulsatile tone when flow is present, silence when it is blocked. Pitch reflects velocity, so stenosis sounds higher. |
| 9 | Endoscope | Picture-in-picture second camera behind the aneurysm, used to check the PCom, AChA and residual neck. |
| 0 | Temporary clip | Click on the proximal ICA to place or remove it. Starts the occlusion timer and lowers bleeding rate and flow distally. |

Each tool has a simple procedural cursor model and a hover highlight (an emissive rim on the target it can act on, red tint where it would cause harm). Picking uses a raycaster against tagged meshes (`userData.kind = 'arachnoid' | 'vessel' | 'dome' | 'neck' | 'blood' | ...`).

## 6. Procedure stages

A `StageManager` holds the ordered stages. Each stage has sub-goals that are checked every frame against the store.

1. **Open the sylvian fissure**: cut N of M fissure arachnoid segments, then place the spatulas.
2. **Identify M1**: M1 visible and "touched" (dissector or Doppler) after the fissure opens.
3. **Identify the ICA and optic nerve**: open the carotid cistern and touch both.
4. **Confirm PCom and dissect the neck**: Doppler the PCom, find the AChA, neck clearance ≥ 80%.
5. **Clip the aneurysm**: apply a permanent clip that passes the evaluation.
6. **Confirm PCom patency**: ICG plus Doppler on PCom and AChA, and the temporary clip removed.

The checklist (left panel) shows locked, active and done states. **Demo mode** runs a scripted, animated sequence of tool actions for each stage, using the same tool code paths. Any user click or keypress pauses the script and hands control over, with a "Resume demo" button.

## 7. Mentor panel (bottom right)

Calm, short instruction per stage, sub-task checkboxes, stage progress %, and contextual hints (for example "Bleeding: suction first, then a temporary clip on the proximal ICA"). Collapsible. Fully translated.

## 8. Vitals and physiology (top right)

A simple model updated at 20 Hz:
- **HR, BP (sys/dia/MAP), SpO₂** drift with a small random walk around baselines.
- **Blood loss** raises HR and lowers BP (a rough hypovolemia curve). Rupture causes a sharp drop.
- **Temporary occlusion** with MEP: no change for about 5 min, then a gradual decline. Unclipping recovers it with a lag.
- **MEP** also drops if the clip narrows the ICA or occludes the AChA (delayed, about 30 to 60 s, as in reality).
- Scrolling **ECG** canvas (synthetic PQRST at the current HR), operation time, occlusion timer, EBL, MEP %.
- Alarms through Web Audio when values cross thresholds (MAP < 60, MEP < 50%, occlusion > 10 min).

## 9. Bleeding and hemostasis

- **Rupture risk** is a hidden 0 to 1 value. It increases with dissector force on the dome or bleb, suction near the dome, and clip contact before neck clearance. Past a threshold, a probabilistic **intraoperative rupture** happens.
- **Oozing**: small vessel injuries create low-rate sources, stopped by bipolar.
- **Arterial rupture**: high-rate spurting source at the bleb. Its rate scales with ICA flow, so a temporary clip cuts it to roughly 20%.
- Rendering: GPU-friendly instanced particles for active bleeding, plus a **pooling plane** with a custom shader (glossy dark red, meniscus noise) that rises with net blood volume and hides anatomy below it. Suction lowers it locally and globally.

## 10. Clip evaluation

Geometric checks between the clip blade segment and the anatomy:
- **Neck closed**: blade line spans the full neck width (sample points across the neck ellipse).
- **Residual neck**: distance from blades to the parent-vessel wall below a threshold.
- **ICA narrowing**: blades intrude into the ICA lumen radius, reported as % stenosis.
- **PCom / AChA**: occluded if a blade intersects their origin segments.

The results drive the **flow model**, so ICG shows the dome no longer filling (or still filling), Doppler on the PCom goes silent if it was occluded, and the ICA tone rises in pitch if it is stenosed. A small summary appears only after the user has checked with ICG or Doppler.

## 11. Debrief

Total time, EBL, temporary occlusion time, rupture yes/no, clip result breakdown, MEP minimum, and 3 to 5 specific tips generated from rules (for example "Temporary occlusion lasted 11 min; aim for under 10" or "Neck clearance was 55% before clipping; dissect more before applying"). Includes Restart and the disclaimer.

## 12. UI style and i18n

Near-black translucent panels (`rgba(10,14,18,0.72)`), 1px cyan-gray borders, `JetBrains Mono` / system monospace for numbers, green/amber/red status colors, no rounded "app" look. EN/ES toggle in the top bar, all strings via `t('key')`.

## 13. Milestones (each one runnable with `npm run dev`)

| # | Delivers |
|---|---|
| **M1** | Vite project, renderer, microscope camera and controls, post-processing look, all procedural anatomy from config, pulsation, start screen with disclaimer, EN/ES toggle |
| **M2** | Toolbar, keys 1 to 0, cursor models, hover highlights, raycast picking, arachnoid cutting, spatula retraction, dissector neck clearance, basic versions of the remaining tools |
| **M3** | Store, event bus, stage system, checklist, mentor panel with sub-tasks and progress |
| **M4** | Vitals model, ECG, alarms, rupture risk, oozing and bipolar, rupture, particles, pooling, suction, temporary clip and occlusion timer |
| **M5** | Clip placement and rotation/depth, straight and curved clips, clip evaluation, flow model, ICG fluorescence, Doppler audio, endoscope PiP |
| **M6** | Debrief, demo mode with takeover, polish (tuning, performance, accessibility, final translations) |

After each milestone: run `npm run build` (type check) and the dev server, check the browser console in the preview, fix errors, then report what to test.

## 14. Notes and assumptions

- The anatomy is **schematic, not patient-specific**. Proportions roughly follow typical adult measurements (ICA about 4 mm, M1 about 3 mm, A1 about 2 mm, PCom about 1.2 mm, AChA about 0.8 mm diameter), all editable.
- The physiology numbers are illustrative and simplified for teaching.
- Target: desktop Chrome, Edge or Firefox with a mouse. Touch is not a goal.
- **Git**: this folder currently sits inside a git repo rooted at your user home directory. I suggest running `git init` inside `BrainSurgery/` so the project has its own repository. I won't commit anything unless you ask.
