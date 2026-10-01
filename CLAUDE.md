# CLAUDE.md: SKYWAY · 3D flight simulator (Three.js)

## 1. Project summary
Single-page browser flight simulator, French UI ("SKYWAY · Simulateur de vol").
It started as a 3D truck/car scene and grew into:
- Civil flight sim: 4 civil + 3 military aircraft, wind, gear, reverse thrust, navigation and flight planning, radar and map, records.
- Combat campaign: 6 missions, enemy AI, guns/missiles/flares, scoring and stars.

Constraints the user set:
- Single HTML file, no downloaded assets.
- Three.js r128 from `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`.
- All textures procedural (canvas). Sounds are Web Audio oscillators.
- Only external resource besides Three.js: Google Fonts (JetBrains Mono, Rajdhani), with fallbacks.

## 2. File layout (current state)
One file: `index.html`.
1. `<style>` + DOM: HUD panels, modals, toasts.
2. `<script>` **main engine**: world, physics, UI, navigation, records, wind, gear, aircraft types.
3. **Combat extension**, pasted before `</body>`: `<style>`, extra DOM, `<script>` IIFE.
   - It extends `AIRCRAFT` and **wraps global functions** (see §9).
   - Must load AFTER the main script.

## 3. Conventions (critical, easy to break)
**Axes and headings**
- Units: meters, m/s, radians internally; km/h and degrees in the UI.
- Aircraft models face **+Z local**; local **+X is the LEFT wing**, −X the right wing.
- World heading `h`: forward = `(sin h, 0, cos h)`. Ground steering: right turn ⇒ `h` decreases.
- Compass: `compassOf(dx,dz) = atan2(-dx, dz)` in degrees. North = +Z, **East = −X**.
- `runwayHdg(ap) = wrap360(-ap.h/DEG)`.
- `bank = atan2(-right.y, up.y)` with right = local (−1,0,0). Positive bank = right wing down.
- Pitch keys (default): ↓ / 5 climb, ↑ / 8 dive (`I` inverts). `rotateX(-θ)` = nose up. `rotateZ(+θ)` = roll right. `rotateY(+θ)` = yaw left.

**Airport-local frame** (= Three `rotation.y = ap.h`)
- `toWorld(ap, lx, lz)`: `x = ap.x + lx·cos h + lz·sin h`, `z = ap.z − lx·sin h + lz·cos h`.
- `toLocal` is the inverse.

**Wind**
- `WX.from` = compass direction the wind blows FROM.
- Wind vector (toward) = `(sin b, 0, −cos b) · speed`.

**Three.js r128 gotchas**
- Object `lookAt` points local +Z at the target.
- For enemy orientation use `Matrix4.lookAt(pos+fwd, pos, up)`.
- InstancedMesh needs `frustumCulled = false` (instances spread over the whole map).
- `ConeGeometry` apex is +Y; translate/rotate it as documented in the code.

**Ground layers:** `polygonOffset` factors go -1 (fields/clearing), -2 (asphalt), -3 (water), -4 (paint), -5 (runway numbers).

## 4. World constants
- Plane-center height on gear: `GEAR = 1.6`. Wheels bottom at −1.6 local.
- `WORLD = 3200` (play area ±3200 m). Ground plane 16000², fog 450–2800, camera far 6000, sky sphere r = 4000.
- Runways 800 × 30 m. `ROAD_X = 90`, `ROAD_LEN = 3000` (road along Z).
- `AIRPORTS`:

  | id | name | x | z | h (rad) |
  |---|---|---|---|---|
  | VAL | Vallée | 0 | 0 | 0 |
  | LAC | Lac Bleu | −1700 | 1300 | −0.6 |
  | NOR | Col du Nord | 1700 | 1700 | 0.9 |
  | SUD | Plateau Sud | 900 | −2100 | 1.75 |

- `LAKES`: (−2250, 950, r 240) and (1250, −1250, r 160).
- Mountains: 50 random cones (r 160–380, ring 750–2900 m) with vertex jitter (deterministic `hash`, positions rounded) and vertex-color snow.
  - They keep clear of airports (r + 750), lakes and the road.
  - `terrainHeight(x,z)` = max over mountains of `h·(1 − d/(1.05 r))`, otherwise 0.
- Scenery placement uses `blockedForScenery()`:
  - Instanced trees (`GFX.trees`, 450–1700 by tier).
  - Textured field patches (`GFX.fields`, 60–160).
  - Clouds (`GFX.clouds`, 35–110): each cloud is ONE mesh with its puffs merged into one geometry.
- Each airport has:
  - Runway texture, numbers.
  - Paint markings, edge and threshold lights as `InstancedMesh` (`instanced()` + `flatMatrix()` on `GEO.unitPlane`). The road dashes use the same approach.
  - Tower, hangar, apron.
  - A world-space windsock (`socks[]`).
- An autonomous truck drives back and forth on the road.

## 5. Flight model (`updatePlane(dt)`, vector aerodynamics)
**Ground**
- `S.roll` = signed ground speed along the heading (−6 … 200; reverse allows backing up).
- Airspeed = roll + headwind.
- Static friction 1.2, rolling friction 1.2, brakes 14 m/s².
- Weathervaning: crosswind turns the nose into the wind.
- Liftoff: pitch-up input AND airspeed ≥ `AC.vr` AND reverse off.

**Air** (3-DOF point mass + kinematic attitude)
- State: `S.va` = air-relative velocity vector (world). `S.speed = |va|`. `S.vy` is kept for compatibility (= va.y − forward.y·speed).
- Density ratio `σ = e^(−alt/8500)` (`airDensityRatio`). Normalised dynamic pressure `qr = σ·(V/AC.stall)²` (1 = q at stall, sea level).
- Wing α = angle of va in the body frame + `WING_INC` (4°). `liftCoef(α)` = CL/CLmax: linear up to `ALPHA_STALL` (16°), −25 % break, fades to 0 by ~50°.
- Lift accel = `9.8·qr·cl`, clamped to `AC.gMax` (−gMax/2 when negative), along up ⟂ va.
- Drag = `dragK·σ·V²` (parasitic, equals the old model at sea level) + `K_IND·|lift·cl|` (induced) + flat plate `CD_PLATE·sin²(nose vs airflow)`.
- Side force `SIDE_K` kills sideslip. Thrust is ×σ, so the true-airspeed top speed ≈ `vmaxOf` at any altitude.
- Coordinated turn: each step the nose is yawed about world-up by the heading change of va (centripetal force = banked lift). Turn rate = g·tanφ/V; `AC.turn` no longer exists.
- Weathercock: yaw toward va (sideslip). When stalled (hysteresis 16° / 12°) the nose drops toward α = 10°.
- Auto-stab pitch targets flight-path angle γ = 0 (not pitch 0), so "hands off" = level flight at any speed.
- α limiter: pitch input fades out near the stall when `qr > 1`. Hard pulls at speed don't stall; low-speed stalls still happen.
- Gust effect: `va −= ΔW` (ground speed is conserved). Position += `va + wind + (0, wAir, 0)`.
- Stall warning: `S.stallWarn` (α > 13° or qr < 1.05). `S.vsEff = stall/√σ` (true-airspeed stall speed at altitude) drives the HUD margin.
- Calibration (checked with a Node harness that runs the real `updatePlane`): cruise trims to vs ≈ 0, top speeds match `vmaxOf`, 45° turns match g·tanφ/V.

**Controls**
- Spring-centered control surfaces `S.ctl.{p,r,y}`: they ramp at `AC.ctlRate` while a key is held and return ×1.6 faster when released.
- Auto-stabilization levels bank, and pitch when |bank| < 90° and above stall, scaled by `AC.stab·(1 − |ctl|)`.
- Tilt input (mobile): `TILT.p/r` (analog −1…1) replace the pitch/roll keys when `TILT.on` and no key is held.
- Throttle is a sticky lever (does NOT spring back).

**Turbulence:** filtered noise (`turbV/R/P`, sqrt(dt) scaling) plus mountain waves (updraft upwind, downdraft downwind) in `updateAirMass()`.

**Wind (`windAt(agl, t)`)**
- Profile ×0.8 at the ground up to ×1.6 at 400 m.
- Gusts via `smoothNoise`; direction wobble ±15°·gust.
- Pause-safe because it uses `simT`.

**Crash conditions**
- Touchdown with gear < 98 % down.
- Descent < −7 m/s.
- Lateral drift > 6 m/s.
- Bad attitude.
- Terrain collision.
- Speed > `vne + 18`.

**Landing grade:** uses `|vs| + 0.35·|lateral|`. Under 1 = Parfait, under 2.5 = Bon, under 4.5 = Ferme, otherwise Dur.

**Fuel and engine**
- Fuel (%) burns `fuelBase + fuelThr·throttle` per second.
- Refuels at 10 %/s when stopped on any runway.
- RPM is display only.

**Gear (`G`):** 3 s transit, retractable types only, not on the ground. Gear-up horn and "VITESSE TRAIN" warning above `vle`.

**Reverse (`X`):** ground only, aircraft with `reverse > 0`. Thrust becomes `−throttle·thrust·reverse`.

## 6. Aircraft (`AIRCRAFT`, selected with `T`)

| id | role | stall / vr (m/s) | thrust | drag | gear | reverse | notes |
|---|---|---|---|---|---|---|---|
| alouette | trainer, high wing | 22 / 26 | 5.2 | .0016 | fixed | 0 | very stable |
| sirocco | touring, low wing | 28 / 32 | 7 | .0011 | retract | .35 | default |
| faucon | aerobatic | 32 / 38 | 11.5 | .00095 | retract | 0 | roll 3.4 |
| atlas | twin-engine cargo, T-tail | 34 / 40 | 6.8 | .0007 | retract | .6 | sluggish, stable |
| epervier* | delta + canards jet | 50 / 60 | 26 | .00045 | retract | 0 | AB ×1.45 |
| harfang* | twin-tail multirole jet | 55 / 66 | 25 | .00042 | retract | 0 | 6 missiles |
| titan* | armored attack jet | 40 / 48 | 14 | .0005 | retract | 0 | armor ×2.2 |

\* defined in the combat extension.
- Military entries also carry: `jet: true`, `ab`, `baseThrust`, `baseFuelThr`, and `mil: {guns, missiles, flares, armor, gunDmg}`.
- Each type also defines: `pitch, roll, yaw, gMax, stab, ctlRate, vne, vle, gearDrag, xwind, rpmMax, snd`, plus `look` (geometry and livery colors).
- `vmaxOf(a) = sqrt(thrust / (drag·(1 + (retract ? 0 : gearDrag))))`.

## 7. Controls (keyboard, AZERTY + QWERTY)
- **Key normalization:** `keyId(e)` maps `Digit*` and `Numpad*` codes to digits, everything else to `e.key.toLowerCase()`.
- **Throttle:** Z/W up, S down.
- **Pitch:** 5/↓ climb, 8/↑ dive. **Roll:** 4/←, 6/→. **Rudder:** A/Q left, E/D right.
- **Ground:** Space brakes, G gear, X reverse.
- **Windows:** M/P map & flight plan, L records, T aircraft & weather.
- **Camera look (GTA-style):** drag on the 3D view (left/right button or one finger) to orbit, wheel to zoom, double-click to recentre; it auto-recentres 1.5 s after release. Hold O or the middle mouse button for the rear view. Applies to Poursuite, Cockpit (head look) and Latérale; Cinéma ignores it. State: `LOOK` (`lookState`, `updateLook`, `initMouseLook`).
- **View, sound, misc:** C camera (Poursuite/Cockpit/Latérale/Cinéma), K record trajet, N sound, I invert pitch, H help, R restart, Esc pause / close modal.
- **Combat:** J campaign, F gun (hold), V missile, B flares, Tab next target, Shift + full throttle afterburner.

## 8. Main engine: key state and functions
**State objects**
- `S`: global flight state, including `throttle, speed, roll, vy, heading, onGround, crashed, paused, fuel, ctl, gearPos/Target, reverse, wAir, vel, prevVel, flight, home, ab`.
- `AC`: current aircraft. `plane`: current mesh. `mission`, `plan`, `NAV`: navigation trip.

**World and aircraft builders**
- `init`, `buildTextures`, `canvasTex`, `texRep`, `makeAsphalt`, `makeLivery`.
- `createSky / Ground / Lakes / Road / Mountains / Trees / Clouds`, `buildAirport`, `buildWindsock`.
- `createPlane(ac)` returns a Group with `userData.parts = {props, gear, ail[{piv, side}], elev, rud, beacon}`.
- `createTruck`, `applyAircraftCamera`, `animatePlaneParts`.

**Flight and flight lifecycle**
- `updatePlane`, `updateAirMass`, `windAt`, `terrainHeight`.
- `placeAtAirport(id)`, `resetFlight`, `setAircraft(id)` (only on the ground or after a crash).
- `toggleGear`, `toggleReverse`, `onTakeoff`, `onTouchdown`, `finishLanding`, `crash`.

**Navigation and HUD**
- `computeAttitude`, `computeNav` (BRG, DIST, ETA, DTK, XTK, 3° glide path, remaining distance).
- `drawHorizon`, `drawStick`, `drawRadar(t)` (heading-up, 4 ranges, terrain colored by clearance), `drawMap` (zoom, pan, click to add waypoint).
- `updateHUD` runs at ~15 Hz; alerts are deduplicated with `lastAlerts`.

**UI**
- `openModal`, `closeAllModals` (pauses the sim and blurs the focused element), `showDialog(title, html, [[label, fn, primary]], cls)`, `toast(msg, type)`.
- `renderPlan`, `startMission`, `renderAircraft`, `renderWeather`, `renderRecords`.

**Main loop:** `animate()` → fixed-step physics → animatePlaneParts → truck / clouds / windsocks / particles → attitude and nav → camera → world → HUD → canvases → sound → render.
- Fixed step: an accumulator runs `physicsStep(1/120)` (simT + updatePlane), max 12 steps per frame. When `RP.active`, `replayUpdate` runs instead. `recordTick` runs after the physics steps.
- Rendering interpolates the plane pose between the last two physics steps and restores the true pose right after `render`. Interpolation is skipped if the plane moved > 30 m (teleport).

**Graphics quality / GPU adaptation** (block right after `DB`, before the state objects)
- `GPU` (IIFE at load): probes a WebGL context with `powerPreference: 'high-performance'` and reads `WEBGL_debug_renderer_info`. A second context with `failIfMajorPerformanceCaveat` detects software rendering. It then calls `classifyGPU(name, {mobile, software})` → `low | medium | high | ultra`, and drops one tier if `deviceMemory ≤ 2` or there are ≤ 2 cores.
- Rough tier mapping:
  - SwiftShader / llvmpipe / old Intel HD / Mali-G5x / Adreno ≤ 5xx → low.
  - Intel UHD/Iris, Radeon integrated, recent mobile → medium.
  - GeForce / Radeon RX / Apple M → high.
  - RTX x060+ / RX x700+ / M Max → ultra.
- `GFX_TIERS[tier]` = `{pr, prMin, aa, shadows, shadowSize, soft, box, aniso, trees, fields, clouds, puffs}`. `GFX` is the resolved tier, available as a global (the combat extension reads `GFX.puffs`).
- Choice: `DB.settings.gfx` (`'auto'` or a tier id). The `?gfx=` URL parameter overrides it, which still works when localStorage is blocked. `setGfx(id)` confirms with the user, then reloads the page, because scene counts and MSAA are fixed at init.
- Renderer: `antialias: GFX.aa`, `powerPreference: 'high-performance'` (selects the discrete GPU on dual-GPU laptops). Shadows are off on low; PCF on medium, PCFSoft above. Anisotropy is capped by `GFX.aniso`. The shadow box is ±`GFX.box` m.
- Dynamic resolution (`DYN`, `updateDynRes(raw dt)`, toggle `DB.settings.dynRes`):
  - It measures fps over 1.5 s windows.
  - Below 48 fps it lowers the pixel ratio, down to `GFX.prMin`.
  - Above 58 fps it raises it back toward `min(devicePixelRatio, GFX.pr)`, with an 8 s hold after any drop.
  - It warns once (toast) if the game stays under 25 fps at the floor.
- `webglcontextlost` is `preventDefault`ed; `webglcontextrestored` reloads the page.
- UI: the "Graphismes" block in the T window (`renderGfx`) shows tier buttons, the dynamic-resolution toggle, and the GPU, shadows, MSAA, resolution and fps.

**Cameras**
- `chaseCam` (Poursuite): critically damped spring on the camera *offset* (so no lag at high speed), look-ahead, follows 28 % of the bank, FOV 60→82 with speed (+7 with afterburner), shake at high speed or high g.
- `cineCam` (Cinéma): auto director cycling `SHOTS` (chase, flyby, orbit, track, front, ground) every 5–8 s.

**Recording and replay**
- `REC` samples 10 Hz frames `[x,y,z,qx,qy,qz,qw,speed,thr,gear]`. It stops automatically on a crash, a teleport, or after 20 min.
- Saved under a separate localStorage key `skyway.replays.v1` (`RecStore`): max 6, oldest dropped if storage is full.
- The Records modal lists replays (▶ / export / delete). A single-replay JSON (`skywayReplay: 1`) can be loaded with Importer.
- `startReplay` switches aircraft if needed; `exitReplay` calls `resetFlight`. Replay keys: Space, ← →, ↑ ↓, C, Esc.

**Touch and tilt**
- `IS_TOUCH` adds `body.touch`. `#touchPad` hold buttons map to `keys` (z, s, a, e, space); tap buttons handle gear, calibrate and REC.
- The Inclinaison button calls `toggleTilt` (iOS permission prompt; fullscreen and landscape lock are best-effort).
- `onOrientation` turns beta/gamma into a screen-space up vector. Roll = steering-wheel tilt, pitch = top edge toward you = climb, neutral = calibration (`TILT.p0`).
- Sensor events need HTTPS (or localhost).
- Landscape only on touch devices: the first touch calls `goLandscape` (fullscreen + `screen.orientation.lock('landscape')`, Android). In portrait, `#rotateHint` covers the UI and `refreshPause` pauses the sim (`portraitBlocked()`). iPhone Safari cannot lock orientation, so the overlay is the fallback there.

**Persistence:** `Store` (localStorage key `skyway.sim.v1`, in-memory fallback) and `DB`:
```
DB = {
  flights[],
  best{maxAlt, maxSpeed, longest, softest},
  settings{invert, sound, ac, gfx, dynRes, wx{preset, from, base, gust, turb}},
  combat{unlocked, best{levelId: {score, stars, time, ac}}, ac}
}
```
- Export/import JSON is available in the Records window.

## 9. Combat extension (IIFE after the main script)
**Wrapped globals** (pattern: `const _f = f; f = function(...){ ... _f(...) ... }`):
- `createPlane` → `createJet` for `ac.jet`.
- `applyAircraftCamera`: jet cockpit position.
- `updatePlane`: afterburner thrust/fuel, then `combatUpdate`.
- `animatePlaneParts`: flames, second rudder, missile pylons.
- `crash` → `fail()`.
- `resetFlight`: restarts the level.
- `updateCamera`: camera shake.
- `drawRadar`: enemy blips, overlay drawing, UI tick.
- `drawMap`: enemies.
- `renderAircraft`: weapon rows.
- `renderRecords`: campaign table.

**Other pieces**
- `CB`: combat state, holding `hp, ammo, msl, flr, score, kills, shots, hits, enemies, bullets, missiles, flares, puffs, smokes, pending, goals, rtb, target, lockT, radarDown`.
- `UNIT` (hp, radius, score): drone 20/5/50, fighter 60/8/300, ace 180/8/1500, bomber 220/15/400, truck 40/8/150, aaa 60/6/200, sam 90/7/350, radar 120/9/500.
- AI per kind:
  - fighters: lead pursuit, evasion, terrain avoidance, gun bursts, missiles;
  - bombers: fly to base, tail gunner;
  - drones: orbit;
  - trucks: drive −Z on the road;
  - AAA: flak;
  - SAM: missile every 9 s (16 s once the radar is destroyed), only if the player's AGL > 60;
  - radar: rotating dish.
- Weapons:
  - bullets: segment-vs-sphere hit test;
  - player gun: 18 rounds/s at 950 m/s, plus aircraft velocity;
  - missiles: lead pursuit, player 480 m/s turning 3.2 rad/s, enemy 360 m/s turning 2.1 rad/s;
  - lock: < 3.2 km and within 0.33 rad, takes 0.9 s;
  - flares: 75 % chance to decoy each incoming missile.
- `LEVELS` (6), each with `{id, name, diff, base, wx, time, air?, brief, tips, spawn[{kind, n, at, spread, alt, skill, msl, delay, speed, toward, escort}], goals[{kinds, label}], rtb?, fail?('convoy'|'bombers')}`.
- Scoring: kills + 3·time left + 10·hp + 1000·accuracy.
  - Stars: 1 for completing, +1 if hp ≥ 60, +1 if time ≤ 60 % of the limit.
  - Completing a level unlocks the next one.
- Stopping on any runway during combat repairs and rearms.
- Combat HUD: full-screen `#cbOverlay` canvas (gunsight, target brackets, lock diamond, lead circle, off-screen arrows, damage vignette), `#cbPanel`, `#cbBanner`, `#cbModal`.

## 10. Known caveats / gotchas
- The main script resets `settings.ac` to 'sirocco' when the saved id is unknown, because jets are defined later. The extension restores the saved jet from `Store.load()`.
- localStorage is blocked in claude.ai artifact previews. Records then live only for the session; Export works.
- `setAircraft` refuses while airborne. `startLevel` works around this by setting `S.crashed = true` before switching.
- Two `keydown` listeners exist (main + combat). Tab needs `preventDefault`; inputs and selects are ignored.
- Enemy/particle systems create a material per puff (capped at `GFX.puffs`, 250–900). Watch performance if you add more effects.
- New static scenery should respect the `GFX` budgets. Batch repeated small meshes with `instanced()`, because draw calls are the main cost: about 155 per frame versus about 500 before batching.
- `GFX`, `GPU` and `DB` are read before `init()`. `DYN` is declared next to `animate` and must exist before `init()` runs.
- `center(e)` and the temp vectors are shared; clone them before storing.

## 11. Suggested next steps for Claude Code
1. Split into modules with Vite:
```
   src/
     world/    (terrain, airports, scenery)
     flight/   (physics, wind, aircraft)
     ui/       (hud, map, radar, modals)
     nav/
     combat/   (units, ai, weapons, levels)
     store/
```
   - Replace the function-wrapping hooks with explicit events/hooks.
2. ~~Fixed-timestep physics loop~~ (done, 120 Hz).
3. Add unit tests for the coordinate helpers (`compassOf`, `toLocal`/`toWorld`), wind, landing grading and the scoring formula.
4. Add gamepad controls (Gamepad API), and pool the bullet/puff meshes.