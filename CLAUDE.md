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
One file: `threejs-airplane-simulator.html`.
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
  - ~1100 instanced trees.
  - 120 textured field patches.
- Each airport has:
  - Runway texture, markings, numbers, edge and threshold lights.
  - Tower, hangar, apron.
  - A world-space windsock (`socks[]`).
- An autonomous truck drives back and forth on the road.

## 5. Flight model (`updatePlane(dt)`, arcade)
**Ground**
- `S.roll` = signed ground speed along the heading (−6 … 200; reverse allows backing up).
- Airspeed = roll + headwind.
- Static friction 1.2, rolling friction 1.2, brakes 14 m/s².
- Weathervaning: crosswind turns the nose into the wind.
- Liftoff: pitch-up input AND airspeed ≥ `AC.vr` AND reverse off.

**Air**
- `S.speed` = airspeed. Acceleration = `thrust − drag·(1 + gearDrag·gearPos)·v² − 9.8·forward.y`.
- Gust effect: `speed −= ΔW · forward`.
- Position += `forward·speed + wind + (0, vy + wAir, 0)`.
- Lift: `lift = clamp(speed/stall)`, `vy += −9.8·(1 − lift²)`, damped by `lift²`. Below stall the nose drops.

**Controls**
- Spring-centered control surfaces `S.ctl.{p,r,y}`: they ramp at `AC.ctlRate` while a key is held and return ×1.6 faster when released.
- Auto-stabilization levels bank, and pitch when |bank| < 90° and above stall, scaled by `AC.stab·(1 − |ctl|)`.
- Bank-induced turn: world-Y rotation by `right.y · AC.turn`.
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
- Each type also defines: `pitch, roll, yaw, turn, stab, ctlRate, vne, vle, gearDrag, xwind, rpmMax, snd`, plus `look` (geometry and livery colors).
- `vmaxOf(a) = sqrt(thrust / (drag·(1 + (retract ? 0 : gearDrag))))`.

## 7. Controls (keyboard, AZERTY + QWERTY)
- **Key normalization:** `keyId(e)` maps `Digit*` and `Numpad*` codes to digits, everything else to `e.key.toLowerCase()`.
- **Throttle:** Z/W up, S down.
- **Pitch:** 5/↓ climb, 8/↑ dive. **Roll:** 4/←, 6/→. **Rudder:** A/Q left, E/D right.
- **Ground:** Space brakes, G gear, X reverse.
- **Windows:** M/P map & flight plan, L records, T aircraft & weather.
- **View, sound, misc:** C camera (chase/cockpit/side), N sound, I invert pitch, H help, R restart, Esc pause / close modal.
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

**Main loop:** `animate()` → updatePlane (unless paused/crashed) → animatePlaneParts → truck / clouds / windsocks / particles → attitude and nav → camera → world → HUD → canvases → sound → render.

**Persistence:** `Store` (localStorage key `skyway.sim.v1`, in-memory fallback) and `DB`:
```
DB = {
  flights[],
  best{maxAlt, maxSpeed, longest, softest},
  settings{invert, sound, ac, wx{preset, from, base, gust, turb}},
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
- Enemy/particle systems create a material per puff (capped at 700 puffs). Watch performance if you add more effects.
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
2. Add a fixed-timestep physics loop (e.g. 120 Hz) for determinism.
3. Add unit tests for the coordinate helpers (`compassOf`, `toLocal`/`toWorld`), wind, landing grading and the scoring formula.
4. Add touch/gamepad controls (Gamepad API), and pool the bullet/puff meshes.