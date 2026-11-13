# IC-PC Aneurysm Clipping Simulator

Browser-based educational simulator of microsurgical clipping of a right internal carotid–posterior communicating artery (IC-PC) aneurysm through a pterional, transsylvian approach, seen through a simulated operating microscope.

> **Educational demonstration only.** Not clinical training, not validated for skill assessment, not medical advice. Anatomy and physiology are schematic and simplified.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
```

Requires a desktop browser with WebGL2 (Chrome, Edge, Firefox) and a mouse.

## Controls

| Input | Action |
|---|---|
| Left or middle drag (no instrument) | Tilt the microscope |
| Right drag / arrow keys | Move the field |
| Mouse wheel / + − | Magnification |
| Double-click | Center and focus |
| 1–0 | Instruments (press again or Esc to put down) |
| 7 | ICG on/off |
| T / H | Tuning panel / controls help |

Clip (6): Q/E rotate · R/F tilt · Shift+R/F sideways · wheel blade depth · Shift+wheel blade length · Tab straight/curved · click apply · click an applied clip to remove it.

**Demo mode**: "Watch demo" on the start screen or the Demo button. Any click on the field or key press takes over; "Resume demo" continues from the current step.

## Procedure

1. Open the sylvian fissure (cut arachnoid, then retract)
2. Identify M1
3. Identify the ICA and optic nerve
4. Confirm the PCom (and the AChA, with the endoscope) and free the neck
5. Clip the aneurysm
6. Confirm patency: ICG (temporary clip off), Doppler on the PCom, endoscope behind the dome

Clip findings (neck closure, residual neck, ICA narrowing, PCom/AChA patency) are revealed only by those checks. "End case" opens the debrief at any time.

## Where to tune

| File | What |
|---|---|
| `src/config/anatomy.ts` | All anatomy: sizes, positions, colors, vessel splines, aneurysm, nerves, arachnoid, adhesions, spatulas (1 unit = 1 mm) |
| `src/config/sim.ts` | Microscope, rendering, physiology, bleeding, neck clearance threshold |

## Code layout

```
src/
  config/     anatomy and simulation parameters
  core/       event bus, state store, i18n (en/es)
  scene/      renderer, microscope camera, light, post-processing, ICG, endoscope view
  anatomy/    procedural lobes, vessels, aneurysm, nerves, arachnoid, adhesions, spatulas
  tools/      instruments, cursor models, tool manager
  procedure/  stages, stage manager, clip evaluation, clip check, scoring, demo mode
  physics/    heart, physiology, bleeding, flow model
  audio/      Web Audio synthesis (Doppler, alarms, pulse tone, instruments)
  ui/         HUD, toolbar, checklist, mentor, vitals, clip check, debrief, start screen
```

In development, `window.__sim` exposes the main objects for inspection in the browser console.
