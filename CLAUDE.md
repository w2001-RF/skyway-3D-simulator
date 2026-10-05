# CLAUDE.md: SKYWAY · 3D flight simulator (Three.js)

## 1. Project summary
Single-page browser flight simulator, French UI ("SKYWAY · Simulateur de vol").
It started as a 3D truck/car scene and grew into:
- Civil flight sim: 5 civil aircraft (including the Mistral airliner) + 4 military (including the Condor bomber), wind, gear, flaps, reverse thrust, navigation and flight planning, ILS / PAPI / meatball, radar and map, records.
- 7 procedural maps (18–22 km play areas plus 6 km of surrounding terrain), sorted from easiest to hardest and switchable in the M window. Procedural cities (street grids, towers, houses, parks, roads) on every map; a coastal metropolis, a river plain and fjords among them. An aircraft carrier (catapult, arresting wires) sits on Vallée, Archipel and Fjords.
- Missions hub (J): pilot school (7 guided lessons), civil transport contracts (freight and passengers), combat campaign.
- Keyboard, touch/tilt and gamepad controls.
- Combat campaign: 9 missions in two series (air superiority, ground attack), enemy AI, guns/missiles/bombs/flares, scoring and stars.
- Online mode (U): one peer-to-peer session of up to 8 pilots, with no game server (WebRTC; discovery through public WebTorrent trackers).
- Hosted on GitHub Pages (`https://w2001-rf.github.io/skyway-3D-simulator/`) with SEO pages (guide, privacy), Google AdSense ad breaks, and an Expo / React Native app in `mobile/` that wraps the hosted game (see §9d).

Constraints the user set:
- Single HTML file, no downloaded assets.
- Three.js r128 from `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`.
- All textures procedural (canvas). Sounds are Web Audio oscillators.
- Other external resources:
  - Google Fonts (JetBrains Mono, Rajdhani), with fallbacks.
  - Trystero (`@trystero-p2p/torrent@0.25.4`, ESM from jsDelivr), loaded with a dynamic `import()` only when the player first clicks « Rejoindre » in the online window.
  - Google AdSense (`pagead2.googlesyndication.com/pagead/js/adsbygoogle.js`), injected only when `ADSENSE_CLIENT` is set, over HTTPS, and never inside the mobile app (§9d).
  - Two official three.js r128 example scripts from jsDelivr (`three@0.128.0/examples/js/…`, same version as the core): `utils/BufferGeometryUtils.js` (merges aircraft parts per material) and `geometries/RoundedBoxGeometry.js`. The code checks `THREE.BufferGeometryUtils` / `THREE.RoundedBoxGeometry` and falls back to unmerged meshes / plain boxes when they fail to load.

## 2. File layout (current state)
The game is one file: `index.html`.
1. `<style>` + DOM: HUD panels, modals, toasts.
2. `<script>` **main engine**: world, physics, UI, navigation, records, wind, gear, aircraft types.
3. **Combat extension**, pasted before `</body>`: `<style>`, extra DOM, `<script>` IIFE.
   - It extends `AIRCRAFT` and **wraps global functions** (see §9).
   - Must load AFTER the main script.
4. **Online extension**: `<style>`, `#olModal`, `<script>` IIFE (see §9b). It loads after the combat extension and wraps the already-wrapped functions.
5. **School & transport extension**: `<style>`, `#msModal`, `#tutPanel`, `#ctPanel`, `<script>` IIFE (see §9c). It uses `window.SKYWAY_COMBAT` (API exported by the combat extension).
6. **Platform extension**, last before `</body>`: `<script>` IIFE for web ads and the mobile-app bridge (see §9d). It wraps on top of everything else.

Site files next to `index.html` (static, served by GitHub Pages; the game never loads them at runtime):
- `guide.html` (French player guide: features, aircraft, maps, controls, ILS/PAPI, missions, FAQ with `FAQPage` JSON-LD, two AdSense display slots) and `privacy.html` (privacy policy required by AdSense, AdMob and the app stores).
- `favicon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `manifest.webmanifest` (installable PWA, landscape, fullscreen).
- `og-image.png` (1200×630 share image: Métropole skyline + title), `hero.png` (same shot without text, guide header).
- `sitemap.xml`, `robots.txt`.
- `mobile/`: Expo SDK 57 app (see §9d and `mobile/README.md`).

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
- InstancedMesh culling uses the geometry bounding sphere only: either set `frustumCulled = false` (`instanced()`), or give each mesh its own geometry clone with a hand-set `boundingSphere` (`buildTrees`).
- `ConeGeometry` apex is +Y; translate/rotate it as documented in the code.

**Ground layers:** `polygonOffset` factors go -1 (fields/clearing), -2 (asphalt), -3 (water), -4 (paint), -5 (runway numbers).

## 4. World: maps, terrain, scenery
- Plane-center height on gear: `GEAR = 1.6`. Wheels bottom at −1.6 local.
- Runways 800 × 30 m.

**Maps (`MAPS`, `MAP_ORDER`, `MAP_DIFF`)**
- `MAP_ORDER` = easiest → hardest: fleuve, vallee (Facile), metro, archipel (Moyen), canyon (Difficile), fjords, alpes (Expert). `MAP_DIFF[id] = {lvl, note}`, `DIFF_NAMES`, `DIFF_COLS`; the map picker shows ●○ dots and the note is prepended to `#mapDesc`.
- Each map = `{name, desc, world, seed, haze, palette, clouds[lo,hi], trees, treeline, snow, fields, airports[], lakes[], cities[]?, road?, corridors?, river?, fjords?, heads?, relief(x,z,N)}`. `relief` is called as a method (`this` = the map), so it can read its own `river` / `fjords` polylines (`polyD(pts, x, z)` = distance to a polyline).
- `WORLD` (play area ±world), `ROAD_X`, `ROAD_LEN` (0 = no road) are `let`s set by `loadMap`.
- `AIRPORTS`, `LAKES`, `CARRIERS` are `const` arrays refilled in place by `loadMap`. Never reassign them.

  | id | name | world (±m) | relief | carrier |
  |---|---|---|---|---|
  | vallee | Vallée | 9000 | original 4 airports + lakes + road at the center (same coordinates as before), hills, ridges to ~1400 m north and east, coast to the west (+X) | PA1 at (8000, 300), heading 0 (parallel to the coast) |
  | alpes | Hautes-Alpes | 10000 | ridged peaks to ~3100 m, flat-floored valleys (`corridors`), glacier altiport GLA ~1700 m | — |
  | archipel | Archipel | 11000 | ocean with islands (`islands`), 1150 m volcano with a crater | PA1 at (0, −6200) |
  | canyon | Canyons | 10000 | 380 m plateau, terraced mesas, gorges with rivers below sea level | — |
  | fleuve | Plaine du Fleuve | 9000 | farmland plain at ~20 m, meandering river (`rz(x)` sine), gentle hills north and south; Fleuveville straddles the river | — |
  | metro | Métropole | 10000 | bay to the south, river polyline (`river`) through Grand-Lumière (metro, towers to ~290 m), hills and an 850 m mountain to the north-west | — |
  | fjords | Fjords | 10000 | 560–1500 m plateau cut by U-shaped sea channels (`fjords` polylines, walls ~900 m), deltas at 3 m at the fjord heads (`heads`), ocean to the west; one-way runways at the heads, straight-in approaches cut by the walls | PA1 at (8600, 2400), heading 0 |

- Airport `y`: a number, or `'auto'` = natural relief at the center (rounded, ≥ 0). Carrier entries have `carrier: true` and `y = DECK_Y`.
- City entry: `{name, kind: 'metro'|'city'|'town'|'village', x, z, r, y?, angle?, fill?}`. Without `y`, a city takes the height of an airport within `r + 1700` m (so both flattened areas match), else the rounded relief at its centre (≥ 1).
- `?map=<id>` overrides `DB.settings.map`. Combat levels always run on `vallee`.

**Terrain (`genHeights`, `TER`)**
- Seeded Perlin noise (`makeNoise(seed)` → `n2`, `fbm`, `ridge`), `mulberry32` RNG. Generation is deterministic per map.
- `naturalHeight` = `relief` + valley corridors (flat floor `w0`, blend to `w1`) + fade to −40 m beyond `world + MARGIN − 2600` (`MARGIN = 6000`: real terrain continues past the play area).
- `genHeights` then flattens:
  - lakes to `l.y`;
  - the road to 0;
  - each city disc (r + 40 m + one cell) to `c.y`, blending over 500 m, but only where the relief is above `SEA − 1`: rivers and bays stay water inside cities (quays), unless `fill: true` (fjord towns cut a terrace into the walls);
  - each airport rectangle (local lx −140…90, |lz| ≤ 740, plus one cell) to `ap.y`, blending over 650 m;
  - the sea under each carrier to at least −40 m.
- Grid: `GFX.terrN` cells per side over ±`TER.E` (`E = world + MARGIN`). Cells are about 100 m on Élevé.
- `terrainHeight(x,z)` interpolates on the SAME triangles as the mesh (diagonal (i+1,j)–(i,j+1)), so physics and render match exactly. `terrainGrad` gives the slope.
- `prepareGrids` adds per-vertex `TER.SL` (slope), `TER.FO` (forest density) and `TER.WN` (near water); `sampleGrid` reads them bilinearly.
- `SEA = −2`. Terrain below `SEA` is water.
- Surface helpers:
  - `groundAt(x,z)` = deck / water / terrain height.
  - `surfaceAt(x,z)` → shared `SURF {y, water, lake, deck, slope}`.
  - `deckAt(x,z)` → shared `DK {ap, lx, lz}`. Copy the values before calling it again.

**Rendering a map (`loadMap(id)`; `switchMap(id, then)` adds the loading overlay)**
- `buildTerrain`: tiles of `TILE = 32` cells (one Mesh each, shared Uint16 index, normals from the grid) for frustum culling.
- Terrain material: Lambert with `map = buildColorMap()`. This is one canvas over the whole grid (`GFX.cmap` px), colored per pixel by `terrainColor(palette, h, slope, noise, forest, out, nearWater)`, with farm plots painted on gentle lowland.
- `onBeforeCompile` multiplies the color by `TEX.detail` at two scales (about 24 m and 270 m).
- `buildWater`: per-tile quads at `SEA` on submerged cells, plus a frame of ocean beyond the grid. `MAT.water` is rebuilt per map.
- `buildLakes`: discs + sand rings at `l.y`.
- `buildFields`: crisp textured field meshes, only on exactly flat ground, one merged mesh per `TEX.fields` texture.
- `buildTrees`: one trunk + one leaf `InstancedMesh` per tile.
  - Each tile's cloned geometry gets a hand-set `boundingSphere`, so camera and shadow culling work.
  - Leaf colors come from `setColorAt`.
  - Count = `GFX.treeDen` per km² × `MAP.trees`, capped by `GFX.treeMax`, accepted with probability `FO^1.6`.
- Airports: `buildAirport(ap)` (group at `ap.y`, windsock at `ap.y`, a PAPI at each end). Desert maps use `MAT.clearingSand`. Carriers use `buildCarrier(ap)` (with a meatball).
- Cities (`CITIES`, `buildCities` → `buildCity(c)`, after the airports so `obstacleCap` sees them):
  - Square blocks of `CITY_KIND[kind].block` m (metro 110, city 96, town 80, village 64) on a grid rotated by `c.angle`, visited from the centre outward. A block gets street ground only if its centre is dry and flat at `c.y`; buildings only if `lotOK` (5 points flat, dry, not `blockedForScenery`).
  - Zoning by distance ratio t: metro towers (t < 0.2, 70–200 m, first block = a 240–290 m landmark), offices (< 0.45), mid-rise (< 0.7), houses; city/town/village scale down; villages get a church. 7 % of blocks are parks (green quad + trees). Suburb density = `GFX.city` (0.45 Bas … 1 Élevé/Ultra), villages ×0.45.
  - `obstacleCap(x, z, gy)` caps every building under a 2° approach surface (widening 15 %) out to 6 km from each runway end, and under a lateral slope beside the runways; buildings that would be under 3 m are skipped. Approaches stay at least ~50 m above roofs.
  - Rendering per city: one `InstancedMesh` each for office facades (`MAT.bldgOffice`), other facades (`MAT.bldgFlat`), roof prisms (`GEO.roof`, `MAT.roof`) and park trees, plus one merged mesh for the street blocks (`MAT.cg_<kind>`, one block per texture tile) and one for parks; hand-set bounding sphere for culling; red obstruction lights (`aidPoints`) on buildings over 110 m.
  - Facade shader (`facadeMat`): the UVs are rescaled by the instance scale, so one texture tile = one bay × one floor at any building size; top faces get a flat roof colour. Per-instance colours tint the facades.
  - Collisions: `addFootprint` stores oriented boxes in `BLD.map` (64 m cells); `buildingAt(x, y, z, pad)` returns the box hit.
  - `ROADS` (`cityRoads()`): each city links to its nearest airport and nearest city (metro: two cities). Painted on the ground colour map (skipped over water) and drawn with the city names on the M map.
- `buildMapImage`: 720 px map image (relief colors × hillshade + contour lines every 100 m, darker every 500 m) and `PEAKS` (local maxima ≥ 150 m, at least 1.8 km apart).
- Everything goes in `worldGroup`. `disposeWorld` frees the per-map geometry, materials and textures, but keeps `MAT`, `GEO`, `TEX` and `numberMats`.
- Haze color (`MAP.haze`) drives fog, background and sky horizon.
- Clouds: `GFX.clouds` meshes (puffs merged), recycled in a square of ±`GFX.fog·1.1` around the plane (`updateClouds`), altitude band `MAP.clouds`.
- The truck only exists on maps with a `road`.

**Aircraft carrier (`CV`, local frame like an airport: +Z = bow)**
- Deck 300 × 64 m at `DECK_Y = 16`. Island on the starboard side (−X), box `CV.ISL`.
- Catapult track from `CV.CAT0` (+10) to `CV.CAT1` (+146). Civil aircraft start at `CV.START` (−132). Wires at `CV.WIRES` (−100, −88, −76, −64).
- Deck texture: 256 × 1024 canvas (top = stern, left = starboard).
- Vallée's carrier was turned from h = π/2 to h = 0: with its stern toward the land, the straight-in approach crossed an 800 m cliff 2.5 km out. Now approach and catapult are both over the sea.
- Touchdown aim point `CV.TDZ` (−82, between the 2nd and 3rd wires): the ICLS glide path (3.5°) and the meatball refer to it. Meatball on a port sponson (+X) at `CV.MB_Z` (−78), see §8 « Landing aids ».

## 5. Flight model (`updatePlane(dt)`, vector aerodynamics)
**Ground**
- `S.roll` = signed ground speed along the heading (−6 … 200; reverse allows backing up).
- Airspeed = roll + headwind.
- Static friction 1.2, rolling friction 1.2, brakes 14 m/s².
- Weathervaning: crosswind turns the nose into the wind.
- Liftoff: pitch-up input AND airspeed ≥ `AC.vr` AND reverse off.
- On the ground the plane follows `surfaceAt` (`plane.y = surface + GEAR`, `S.groundY`). Airports can be elevated (`ap.y`).
- If the surface drops by more than 2.5 m (bow of the carrier, cliff edge), the plane becomes airborne with its ground speed (`onTakeoff(ship)`). Otherwise water ⇒ crash, and slope > 0.35 ⇒ crash.

**Carrier (`carrierGround`, `hookDown`, `onCatMark`)**
- Catapult: on the mark (|lz − CAT0| < 14, |lx| < 8, stopped) with throttle ≥ 90 %, the plane is held back for 1.5 s (`S.catHold`).
- Then `S.cat` applies `(vt² − v²)/(2·remaining)` up to vt = 1.25·Vr at CAT1. Leaving the bow pitches the nose up 0.1 rad.
- Hook: jets only, down whenever the gear is down. Crossing a wire toward the bow at > 12 m/s sets `S.trap = {stop: lz + 75, wire}`.
  - Deceleration is `max(5, v²/(2·remaining))`, and the thrust is ignored.
  - Touching down past the last wire with the hook down shows "Bolter".
- Civil aircraft land on the deck with brakes only. They start at the stern, and jets start on the catapult.

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
- Gamepad: `PAD.p/r/y` (analog) replace pitch/roll/yaw when no key is held. `PAD.thr` (RT − LT) moves the throttle at 0.6/s.
- Throttle is a sticky lever (does NOT spring back).

**Turbulence:** filtered noise (`turbV/R/P`, sqrt(dt) scaling) plus mountain waves in `updateAirMass()`. Wave = `0.6·(wind · terrain gradient over ±120 m)`, clamped to ±0.45·wind and fading out by 700 m AGL. Roughness grows with slope.

**Wind (`windAt(agl, t)`)**
- Profile ×0.8 at the ground up to ×1.6 at 400 m.
- Gusts via `smoothNoise`; direction wobble ±15°·gust.
- Pause-safe because it uses `simT`.

**Crash conditions**
- Touchdown with gear < 98 % down.
- Descent < −7 m/s.
- Lateral drift > 6 m/s.
- Bad attitude.
- Terrain collision: touchdown on slope > 0.2, or more than 2.5 m below the surface (also the carrier hull). Island hit (`carrierHit`). Touchdown or rolling into water / a lake.
- Speed > `vne + 18`.
- Building hit (`buildingAt` with a pad of a quarter span, max 5 m): « Collision avec un bâtiment ». `S.obstWarn` checks the velocity vector 1–5 s ahead (pad 12 m) → « OBSTACLE · REMONTEZ » alert with the terrain beep.

**Landing grade:** uses `|vs| + 0.35·|lateral|`. Under 1 = Parfait, under 2.5 = Bon, under 4.5 = Ferme, otherwise Dur.

**Fuel and engine**
- Fuel (%) burns `fuelBase + fuelThr·throttle` per second.
- Refuels at 10 %/s when stopped on any runway or carrier deck (`airportAt` covers the deck).
- RPM is display only.

**Gear (`G`):** 3 s transit, retractable types only, not on the ground. Gear-up horn and "VITESSE TRAIN" warning above `vle`.

**Reverse (`X`):** ground only, aircraft with `reverse > 0`. Thrust becomes `−throttle·thrust·reverse`.

**Flaps (`Y` cycles, PageDown / PageUp one notch):** `S.flapTarget` ∈ {0, 0.5, 1} (rentrés / décollage / atterrissage). `S.flapPos` follows over 4 s (`setFlaps`). Full flaps:
- incidence +`FLAP_ALPHA` (3°): the wing stalls 3° earlier in body angle;
- CL ×(1 + `FLAP_CL`) (0.25), so the stall speed drops by about 11% (`S.vsEff` includes it);
- parasitic drag ×(1 + `FLAP_DRAG`·fl) (0.7, added to the gear term in `dragK`);
- lift-off speed ×(1 − 0.08·fl).

Above `vfeOf(AC)` (= `AC.vfe` or 1.75·stall) the HUD shows « VITESSE VOLETS ». HUD chip `#cFlap`. Visual: the flap pieces of `buildWing` sit on `hinge(…, 'flap')` pivots (`P.flaps`), rotated −`FLAP_MAX`·flapPos (38°).

## 6. Aircraft (`AIRCRAFT`, selected with `T`)

| id | role | stall / vr (m/s) | thrust | drag | gear | reverse | notes |
|---|---|---|---|---|---|---|---|
| alouette | trainer, high wing | 22 / 26 | 5.2 | .0016 | fixed | 0 | very stable |
| sirocco | touring, low wing | 28 / 32 | 7 | .0011 | retract | .35 | default |
| faucon | aerobatic | 32 / 38 | 11.5 | .00095 | retract | 0 | roll 3.4 |
| atlas | twin-engine cargo, T-tail | 34 / 40 | 6.8 | .0007 | retract | .6 | sluggish, stable |
| mistral | twin-jet airliner, 70 pax | 46 / 56 | 13 | .00038 | retract | .55 | `vfe` 88, very stable |
| condor* | twin-prop bomber | 36 / 44 | 8 | .0006 | retract | .3 | 16 bombs, no missiles, not a jet |
| epervier* | delta + canards jet | 50 / 60 | 26 | .00045 | retract | 0 | AB ×1.45 |
| harfang* | twin-tail multirole jet | 55 / 66 | 25 | .00042 | retract | 0 | 6 missiles |
| titan* | armored attack jet | 40 / 48 | 14 | .0005 | retract | 0 | armor ×2.2 |

\* defined in the combat extension. The Condor is not `jet` (no afterburner, no hook): it is built by `buildCivil` (twin, `look.mil` livery) but carries `mil`, `ab: 1`, `baseThrust`, `baseFuelThr`.
- Payload `cap: {pax, kg}` (transport contracts): alouette 1 / 120, sirocco 3 / 350, faucon 0, atlas 8 / 4500, mistral 70 / 2500; military types none.
- `look` flags for `buildCivil` twins: `fan` (turbofans under a low wing instead of propellers, main gear at 1.65 r), `pax` (row of cabin windows, doors, « SKYWAY » title, registration below the windows), `mil` (roundel, no cabin windows).
- Military entries also carry: `jet: true`, `ab`, `baseThrust`, `baseFuelThr`, and `mil: {guns, missiles, flares, armor, gunDmg, bombs}` (bombs: Épervier 2, Harfang 4, Titan 10, Condor 16).
- Each type also defines: `pitch, roll, yaw, gMax, stab, ctlRate, vne, vle, gearDrag, xwind, rpmMax, snd`, plus `look` (geometry and livery colors).
- `vmaxOf(a) = sqrt(thrust / (drag·(1 + (retract ? 0 : gearDrag))))`.

**3D models (`buildCivil` in the main script, `buildJet` in the combat extension)**
- Built procedurally from `look`; overall dimensions match the old box models (wheel bottoms at −`GEAR`, same gear pivots, same camera offsets).
- Fuselage, canopies, nacelles, intakes and wheel pants: `loftGeo(sections, seg, ex, a0, a1, caps)`. Super-elliptic sections `[z, halfWidth, halfHeight, yCenter]`, smoothed by `smoothSec` (Catmull-Rom). UV: u = angle (0 belly, 0.25 left side, 0.5 top, 0.75 right side), v = z.
- Wings, tails, pylons and prop blades: `foilGeo(stations, f0, f1)`, a lofted NACA 00xx profile with camber. UV v = 0 lower TE → 0.5 LE → 1 upper TE. A chord slice `f0..f1` makes the control surfaces (real gaps).
- `buildWing(root, K, W, mat)`: main box (chord 0 … `fh`), fixed flaps and tip trailing edges, ailerons on hinges.
- `hinge(parent, a, b, axis, part)` puts a pivot on the hinge line a→b, so `rotation.x` (ailerons, elevator) or `rotation.y` (rudders) turns about the real hinge.
- Details:
  - Interior (panel, seats, pilot), canopy frames, twisted blades with yellow tips, spinner, blur disc.
  - Oleo struts, torque links, tyres (torus), doors or wheel pants, pitot, antennas, exhausts.
  - Jets: intakes with dark ducts, petal nozzles with turbine face, detailed missiles (`MIS_GEO`, vertex colours, also used for fired missiles).
- Liveries are painted per type on canvas by `paintCivilBody/Wing/Tail` and `paintJetBody/Wing/Tail`:
  - `skinTex` returns a colour map and a bump map; `seam()` draws panel lines and rivets.
  - Placement helpers: `bodyFrame().side(ctx, ±1, z, height, fn)` draws in metres, upright on either side of the fuselage. Wing and fin markings use the transforms documented in the code.
  - Content: registrations (`REGS`), cheat lines, cockpit windows, soot, roundels, serials (`SERIAL`), camouflage (`camo`, seeded by `mulberry32`, so it is deterministic).
- Static parts are collected by `kit()` and merged per material (`BufferGeometryUtils.mergeBufferGeometries`). This gives about 30–40 meshes per aircraft, most of them in the gear legs and moving parts.
- Cockpit view (camera 1) shows the real interior:
  - `bodyGeo` builds single-engine and jet fuselages in three lofts, the middle one open on top under the canopy (`loftGeo` `caps: 'start'|'end'`, `vz` keeps the livery v continuous), plus a dark firewall disc facing the pilot.
  - `cockpitShell` adds inward-facing cockpit walls, a bulkhead behind the seats, a floor above the wing root, and a roof behind the twin's windscreen.
  - The pilot is in a `pilotKit` group (`P.pilot`), hidden in camera 1.
  - The model sets `userData.eye`, which `applyAircraftCamera` copies into `cockpitPos`. In camera 1, `camera.near` = 0.08 (otherwise 0.5).
  - Canopy frames are double-sided, so they are visible from inside.
  - Why: the fuselage is single-sided, so from inside it is see-through. Any new cockpit geometry needs inward-facing faces or `DoubleSide`.
  - Over-nose view (needed to see the runway and PAPI on a 3° approach): the eye sits high in the canopy and the cowling slopes down in front of the windscreen.
    - Low wing: canopy `hp` = 0.92 r, eye at the canopy top − 0.13.
    - High wing: the eye stays just under the wing, so the nose sections drop further (`hw` factor in the section list).
    - Jets: `hp` = 0.8 r, eye at the canopy top − 0.14.
    - Seat and pilot are raised by `dy` to match the eye. The Faucon (single seat, eye on the centreline) has no centre canopy bar.
    - Measured by raycasting from the eye against the opaque parts: about 8° (Alouette, Faucon), 9° (Sirocco), 9–10° (jets), more than 25° (Atlas glazed nose). Re-check if you change the nose sections, `hp` or the panel height.
- Lights: coloured lenses (`lens`, vertex colours) plus additive `Points` halos (`glowPts`). Nav lights are always on; `beacon` and `strobe` blink in `animatePlaneParts`.
- Templates: `PLANE_TPL` (Map keyed by the `look` object) caches one built model per type. `createPlane` / `createJet` return `instancePlane(tpl)`, a `clone()` sharing geometry and materials, with `userData.parts` rebuilt from the `userData.part` tags (`prop, blades, disc, gear, ail, flap, elev, rud, rud2, beacon, strobe, flame, pylon, pilot`). **Never dispose a plane's geometry or materials**: they are shared with the template and with enemies of the same type.
- Materials: `airMats()` (shared: chrome, tyres, interior, lenses, glow), `paintMat` (livery), `trimMat(colour)` (generic panel skin tinted).
  - All are `MeshStandardMaterial`s created through `envMat`, which registers them in `ENV_MATS`.
  - `updateEnvMap()` (called by `loadMap`) renders the map's sky, haze, ground and sun into a PMREM environment and assigns it to every registered material: reflections on paint, canopies and metal.

## 7. Controls (keyboard, AZERTY + QWERTY)
- **Key normalization:** `keyId(e)` maps `Digit*` and `Numpad*` codes to digits, everything else to `e.key.toLowerCase()`.
- **Throttle:** Z/W up, S down.
- **Pitch:** 5/↓ climb, 8/↑ dive. **Roll:** 4/←, 6/→. **Rudder:** A/Q left, E/D right.
- **Ground:** Space brakes, G gear, X reverse.
- **Flaps:** Y cycles 0 → décollage → atterrissage; PageDown / PageUp extend / retract one notch.
- **Windows:** M/P map & flight plan, L records, T aircraft & weather.
- **Camera look (GTA-style):** drag on the 3D view (left/right button or one finger) to orbit, wheel to zoom, double-click to recentre; it auto-recentres 1.5 s after release. Hold O or the middle mouse button for the rear view. Applies to Poursuite, Cockpit (head look) and Latérale; Cinéma ignores it. State: `LOOK` (`lookState`, `updateLook`, `initMouseLook`).
- **View, sound, misc:** C camera (Poursuite/Cockpit/Latérale/Cinéma), K record trajet, N sound, I invert pitch, H help, R restart, Esc pause / close modal.
- **Missions:** J opens the Missions hub (school, transport, combat tabs; the top-bar button is « Missions »).
- **Combat:** F gun (hold), V missile, Space or Enter in the air = bomb (edge-triggered in `combatUpdate`, so the gamepad A button works too), B flares, Tab next target, Shift + full throttle afterburner.
- **Online:** U opens the online window (also a « En ligne » button in the top bar, which shows the number of connected pilots).
- **Gamepad** (`pollGamepad()` each frame, standard mapping, first connected pad):
  - Left stick: roll / pitch (pull back = climb, `I` still inverts). Right stick X: rudder. RT / LT: throttle up / down. RT fully pressed at full throttle: afterburner.
  - Held buttons set `keys` (`PAD_HOLD`): A brakes, RB gun, R3 rear view.
  - Tapped buttons dispatch synthetic keydown/keyup (`PAD_TAP`, `padKey`), so both listeners react: B gear, X missile, Y camera, LB flares, Select map, Start pause/Esc, D-pad ← reverse, → next target. D-pad ↑ ↓ change the radar range.
  - Only Select and Start work while a modal or a replay is open.
- **Stick tuning** (T window, « Manette & inclinaison »; `CTL` = `DB.settings.ctl`, sanitised by `ctlSettings` with `CTL_DEF` / `CTL_LIM`):
  - `stickCurve(v, sens)`: dead zone `CTL.dead` (0–30 %, default 12 %, full at 0.95) → expo `(1 − e)·x + e·x³` (`CTL.expo`, default 0 = linear) → × per-axis sensitivity `CTL.p / r / y` (30–200 %), clamped to ±1. Defaults reproduce the old linear response.
  - Tilt: `CTL.tilt` (50–200 %) divides the full-deflection angles (28° roll, 22° pitch).
  - `PAD.raw` = raw [pitch, roll, yaw] axes; while the T window is open, `pollGamepad` redraws `#ctlCurve` (`drawCtlCurve`: curves per axis, dead-zone band, live stick dots). « Par défaut » restores `CTL_DEF`.

## 8. Main engine: key state and functions
**State objects**
- `S`: global flight state, including `throttle, speed, roll, vy, heading, onGround, crashed, paused, fuel, ctl, gearPos/Target, reverse, wAir, vel, prevVel, flight, home, ab, groundY, cat, catHold, trap`.
- `MAP`: loaded map (copy of `MAPS[id]` + `id`). `TER`: height grid.
- `AC`: current aircraft. `plane`: current mesh. `mission`, `plan`, `NAV`: navigation trip.

**World and aircraft builders**
- `init`, `buildTextures`, `canvasTex`, `texRep`, `makeAsphalt`, `makeLivery`.
- `loadMap`, `switchMap`, `genHeights`, `prepareGrids`, `buildTerrain`, `buildColorMap`, `buildWater`, `buildLakes`, `buildFields`, `buildTrees`, `buildMapImage`, `disposeWorld`.
- `createSky`, `createClouds`/`scatterClouds`, `createRoad`, `buildAirport`, `buildWindsock`, `buildCarrier`, `hiTex` (textures drawn at `GFX.tex`× resolution).
- `createPlane(ac)` returns a Group with `userData.parts = {props, blades, discs, gear, ail[{piv, side}], elev, rud, beacon, strobes}` (+ `flames, pylons, rud2` for jets). See §6, 3D models.
- Aircraft kit: `kit`, `hinge`, `rod`, `loftGeo`, `foilGeo`, `smoothSec`, `secAt`, `buildWing`, `bladeGeo`, `spinnerGeo`, `gearLeg`, `lens`, `glowPts`, `skinTex`, `seam`, `mText`, `roundel`, `bodyFrame`, `envMat`, `updateEnvMap`, `airMats`, `trimMat`, `instancePlane`.
- `createTruck`, `applyAircraftCamera`, `animatePlaneParts`.

**Flight and flight lifecycle**
- `updatePlane`, `updateAirMass`, `windAt`, `terrainHeight`, `groundAt`, `surfaceAt`, `deckAt`, `carrierHit`, `carrierGround`.
- `placeAtAirport(id)`, `resetFlight`, `setAircraft(id)` (only on the ground or after a crash).
- `toggleGear`, `toggleReverse`, `onTakeoff`, `onTouchdown`, `finishLanding`, `crash`.

**Navigation and HUD**
- `computeAttitude`, `computeNav` (BRG, DIST, ETA, DTK, XTK, ILS, remaining distance). The target airport object is `NAV.target.ap`. In free flight the target is `NAV.lock` (set by lessons) or the nearest airport.
- `drawHorizon`, `drawStick`, `drawRadar(t)` (heading-up, 5 ranges up to 8 km). `drawRadarTerrain` draws a 64² image sampled every frame: red = above the plane, orange = within 150 m below, blue = water.
- `drawMap`: `MAPIMG` relief, darkened area outside `WORLD`, peaks, carrier ⚓, zoom/pan, click to add a waypoint.
- `fillAirportSelects` rebuilds the plan selects and the map picker (`#mapPick`).
- `updateHUD` runs at ~15 Hz; alerts are deduplicated with `lastAlerts`.

**Landing aids**
- **ILS** (`ILS`, `updateILS(ap)`, called by `computeNav` for the target airport: mission destination, or nearest airport in free flight).
  - Runway end: the side the plane is on when more than 1 km beyond an end, otherwise the current heading; it is then kept while the plane stays near the runway. `ILS.e` = threshold side (−1 ⇒ landing toward local +Z).
  - Aim point `PAPI_IN` (150 m) after the threshold, 3°. Carriers: always toward the bow, aim point `CV.TDZ`, 3.5° (« ICLS PA1 »).
  - `ILS.loc` / `ILS.gs` (radians): > 0 = right of the centreline / above the path. The localizer antenna is 300 m beyond the far end. Full scale (2 dots) `LOC_FS` 2.5° / `GS_FS` 0.7°.
  - Valid (`ILS.on`) when airborne, before the aim point, within 18 km and within ±35° of the centreline.
  - `NAV.gpAlt` = the path altitude within 6 km. Nav bar: `#nGpL` shows « ILS 36 · 3° », `#nGp` the path altitude and deviation.
  - `drawHorizon` draws magenta diamonds: localizer at the bottom, glideslope on the right, hollow when off scale, plus the ident.
- **Visual aids** (`AIDS`, emptied by `loadMap`): `updateLandingAids()` runs every frame after `updateCamera` and works from the **camera** position (what the player sees).
  - Each aid is visible only from the approach side, within 15 km and about ±30°.
  - Points use `MAT.aidPts` / `MAT.aidBall` (`PointsMaterial`, `sizeAttenuation: false`, 8 / 13 px, normal blending so red stays red on bright ground). Housings use `GEO.aidBox`.
  - **PAPI:** 4 lights left of each aim point (16–43 m from the edge), set to 3.5 / 3.17 / 2.83 / 2.5° from the runway outward. On the 3° path: 2 red (inner) and 2 white.
  - **Meatball:** green datum bars plus an amber ball, ×2 real size so it is readable at about 1 km. The ball moves ±4 m for ±0.75° from the 3.5° path and turns red more than 0.5° low.

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
- `GFX_TIERS[tier]` = `{pr, prMin, aa, shadows, shadowSize, soft, box, aniso, fog, terrN, cmap, tex, treeDen, treeMax, fields, clouds, puffs, city}`.
  - Fog far = `GFX.fog` (2800–5200 m), camera far = fog + 1500.
  - `terrN` = terrain grid resolution (160–352). `cmap` = ground color texture (1024/2048).
  - The physics uses the same grid, so terrain detail depends on the tier. `GFX` is the resolved tier, available as a global (the combat extension reads `GFX.puffs`).
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
- Records and replays store `map`. `routeKey` and replay names are prefixed with the map name when the map is not Vallée.
- `startReplay` loads the replay's map and switches aircraft if needed; `exitReplay` calls `resetFlight`. Replay keys: Space, ← →, ↑ ↓, C, Esc.

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
  settings{invert, sound, ac, gfx, dynRes, map, pilot, room, wx{preset, from, base, gust, turb}, ctl{p, r, y, dead, expo, tilt}},
  combat{unlocked, unlockedSol, best{levelId: {score, stars, time, ac}}, ac, start('base'|'carrier')},
  school{done{lessonId: {date, time}}},
  career{money, contracts, pax, kg, failed}
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
- `loadMap`: ends the running mission and clears all units.
- `updateCamera`: camera shake.
- `drawRadar`: enemy blips, overlay drawing, UI tick.
- `drawMap`: enemies.
- `renderAircraft`: weapon rows.
- `renderRecords`: campaign table.

**Other pieces**
- `CB`: combat state, holding `hp, ammo, msl, flr, score, kills, shots, hits, enemies, bullets, missiles, flares, puffs, smokes, pending, goals, rtb, target, lockT, radarDown`.
- `UNIT` (hp, radius, score): drone 20/5/50, fighter 60/8/300, ace 180/8/1500, bomber 220/15/400, truck 40/8/150, aaa 60/6/200, sam 90/7/350, radar 120/9/500, inf 30/10/120, tank 160/6/350, depot 180/16/400.
  - `gunK` scales gun damage (tank 0.25, depot 0.4): armour needs bombs. `inf` = one merged 8-soldier mesh (`SQUAD_GEO`, vertex colours).
  - Ground groups with `march: [x, z]` and `speed` walk over the terrain toward that point, keeping their formation offset; `e.arrived` when within 40 m. Tank turrets track the player relative to the hull.
- AI per kind:
  - fighters: lead pursuit, evasion, terrain avoidance, gun bursts, missiles;
  - bombers: fly to base, tail gunner;
  - drones: orbit;
  - trucks: drive −Z on the road;
  - AAA: flak;
  - SAM: missile every 9 s (16 s once the radar is destroyed), only if the player's AGL > 60;
  - radar: rotating dish;
  - infantry: small-arms bursts at a player below 350 m AGL within 650 m.
- Weapons:
  - bullets: segment-vs-sphere hit test;
  - player gun: 18 rounds/s at 950 m/s, plus aircraft velocity;
  - missiles: lead pursuit, player 480 m/s turning 3.2 rad/s, enemy 360 m/s turning 2.1 rad/s;
  - lock: < 3.2 km and within 0.33 rad, takes 0.9 s;
  - flares: 75 % chance to decoy each incoming missile;
  - bombs (`dropBomb`, `updateBombs`, `blast`): released under the fuselage (twins) or alternately under the wings with the aircraft velocity, gravity plus light drag (`BOMB_DRAG`), blast radius `BOMB_R` 38 m (up to 240 + 120 on a direct hit) on ground units only; the player takes damage within 60 m of the blast;
  - CCIP (`ccip()`): integrates the same trajectory in 0.05 s steps until it meets `groundAt`; the overlay draws the impact circle, the fall line and « LARGUEZ » (red) when a ground target is inside the blast.
- `LEVELS` (9), each with `{id, track?, name, diff, base, wx, time, air?, brief, tips, spawn[{kind, n, at, spread, alt, skill, msl, delay, speed, toward, escort, march}], goals[{kinds, label}], rtb?, fail?('convoy'|'bombers'|'reach'), failMsg?}`.
  - Two series unlocked separately: air superiority (1–6, `DB.combat.unlocked`) and `track: 'sol'` ground attack (7 Dépôts de carburant, 8 Colonne blindée, 9 Tête de pont, `DB.combat.unlockedSol`). Helpers `trackIdx`, `isUnlocked`, `nextInTrack`; the campaign window shows one section per series.
  - `fail: 'reach'` fails the mission when a marching unit arrives.
- Scoring: kills + 3·time left (vs `CB.timeLimit`) + 10·hp + 1000·accuracy.
  - Stars: 1 for completing, +1 if hp ≥ 60, +1 if time ≤ 60 % of the limit.
  - Completing a level unlocks the next one.
- Stopping on any runway or on the carrier deck during combat repairs and rearms.
- Departure option (`DB.combat.start`, campaign window): base, or carrier (`CARRIERS[0]`, catapult start).
  - A carrier start ignores `air` starts and adds transit time: `CB.timeLimit = L.time + dist(carrier, base)/160 + 25`.
  - Return to base is satisfied by stopping at `L.base` OR on the carrier.
  - `startLevel` first `switchMap('vallee')` if needed. The level-3 convoy uses the literal road x = 90.
- Impacts (enemy crashes, wrecks, bullets, missiles, terrain avoidance) use `groundAt` (water and deck included).
- Combat HUD: full-screen `#cbOverlay` canvas (gunsight, CCIP, target brackets, lock diamond, lead circle, off-screen arrows, damage vignette), `#cbPanel` (gun, missiles, flares, bombs, score), `#cbBanner`, `#cbModal`.
- Custom levels: `startCustom(L)` runs a level object outside `LEVELS` (no briefing, no record, no unlock; `time: 0` = no limit). `succeed` / `fail` call `L.onWin()` / `L.onFail(reason)` instead. `curL()` returns `CB.custom || LEVELS[CB.level]`.
- `window.SKYWAY_COMBAT = {state: CB, startCustom, abort, openCampaign, button, _test}` (`_test` exposes `dropBomb`, `updateBombs`, `ccip`, `updateEnemies`, `isUnlocked`, `LEVELS` for headless probes).

## 9b. Online extension (IIFE after the combat extension)
**Model:** one session at a time, full mesh peer-to-peer, at most `MAX_PEERS = 8` pilots (the extras are ignored and the log says so). There is no host and no authority: each client simulates only its own aircraft.
- Discovery: Trystero BitTorrent strategy. `joinRoom({appId: APP_ID}, 'session-' + CODE)` announces on public WebTorrent trackers (`wss://`), which only relay encrypted WebRTC offers and answers.
- Game data then flows directly between browsers over WebRTC data channels. Peers behind a strict NAT or firewall may fail to connect (`onJoinError` is logged); a TURN server would be needed for them.
- Discovery takes about 10–30 s.
- Session code: `cleanCode` (A–Z, 0–9, `-`, max 24). The pilot name is `cleanName` (max 16, no `<>` or control characters). Both persist in `DB.settings.pilot/room`.
- `?session=CODE` in the URL pre-fills the code (« Copier le lien »). Joining another session leaves the current one.

**Actions** (Trystero `makeAction`):
- `hi` = profile `{n, ac, map}`: sent to each new peer, and to everyone after `setAircraft` / `loadMap` (both wrapped).
- `st` = state at 12 Hz: `[t, x, y, z, qx, qy, qz, qw, speed, throttle, gearPos, flags, flapPos]`. `flapPos` is optional (older clients omit it). Flags: 1 on the ground, 2 crashed, 4 afterburner, 8 hidden (replay or invisible).
- `chat` = text (max 200 chars, at most 6 messages per 4 s per peer). Incoming text is shown with `textContent` only.
- All incoming data is validated: finite numbers, aircraft id in `AIRCRAFT`, map id in `MAPS`, quaternion length.

**Remote planes**
- `createPlane(AIRCRAFT[ac])` (template clone, cheap) plus a name/distance `Sprite` (`sizeAttenuation: false`, `depthTest: false`).
- Both are added to `scene` (not `worldGroup`) and shown only when the peer is on the same map, not hidden, and sent data less than `STALE = 6` s ago.
- Interpolation runs 150 ms in the past (`DELAY`), on the sender's clock mapped with `off` = min(receive − send), which drifts slowly upward. When data runs out it extrapolates for up to 0.4 s.
- `animRemote` animates gear, props, blades and flames from the received state.

**Hooks** (wrapping pattern): `updateWorld` sends our state, updates the peers and refreshes the UI every 0.5 s. Also wrapped:
- `drawRadar`: cyan blips + names;
- `drawMap`: cyan arrows + names;
- `setAircraft` and `loadMap`: re-announce the profile.

**UI**
- `#olModal`: pilot name, session code, Rejoindre / Quitter / Copier le lien, tracker status (`getRelaySockets`), list of pilots (aircraft, distance, altitude or other map), chat log.
- Opening any window pauses only the local plane.

**Testing:** `window.SKYWAY_P2P_LIB`, if defined before « Rejoindre », replaces the Trystero import, so headless tests can use a mock `{joinRoom, getRelaySockets}`. A real two-browser test is possible by driving two headless Edge instances (separate `--user-data-dir`) through the DevTools protocol.

## 9c. School & transport extension (last IIFE)
**Payload**: wraps `updatePlane`. Mass factor `m` = (contract mass) × (lesson mass); for non-jets it temporarily sets `AC.thrust / m`, `AC.stall · √m`, `AC.vr · √m` around the original call, then restores them. Contract mass = 1 + 0.35 × load fraction (passengers count 0.8 of the seat fraction).

**Transport contracts** (`CT`, `OFFERS`):
- `makeOffer(from?)`: random pair of non-carrier airports on the current map (12 % chance of a freight delivery to the carrier, ≤ 320 kg). Freight 60–4400 kg (`CARGO` list, some fragile) or 1–70 passengers. `urgent` (delay ×0.8, pay ×1.4), `fragile` (pay ×1.2, hard landings cost more).
- Delay = distance / (0.75 × vmax of the slowest capable aircraft) × 1.45 + 240 s. Pay = (180 + km × (pax: 30 + 4·n, freight: 35 + kg/45)) × modifiers.
- `acceptOffer`: must be on the ground; switches to the smallest capable aircraft if needed, starts a `mission` trip from → to (nav bar, ILS) and places the plane at the origin.
- `contractTick` (per physics step): timer; passenger comfort loses points for |g − 1| > 0.45, bank > 30°, pitch > 18° / < −10°, sink > 9 m/s, stall warning and strong turbulence.
- `finishLanding` is wrapped: landing at the destination after take-off calls `completeContract` (pay: on time / early bonus / late penalty, comfort for passengers, landing grade; 1–3 stars; logs a « Transport » flight; adds a new offer from that airport). A crash loses the contract (`DB.career.failed`). Changing map or starting another flight cancels it.
- `#ctPanel` (bottom left, hides `#help`): load, destination, timer, mass and Vr, comfort bar, expected pay, Abandon.

**Pilot school** (`LESSONS`, `TUT`): 7 lessons on Vallée (switches map, sets the lesson weather and restores `WX` afterwards).
- Lessons: vol1 Premier vol (Alouette), vol2 Approche et atterrissage (Alouette, air start 2.9 km out), cargo1 Cargo lourd (Atlas, mass 1.3, circuit back to runway 36), ligne1 Approche ILS en liner (Mistral, 4.5 km out), chasse1 Postcombustion et voltige (Épervier), chasse2 Armement (Titan, drones + depot via `startCustom`), chasse3 Appontage (Harfang, 1.9 km behind the carrier).
- Steps `{t, ok(), hold?, sum?, hint?}`: `ok` is polled every physics step; `hold` seconds must be continuous unless `sum`. Hints appear after 20 s on a step. `TUT.st` holds lesson state (cumulative roll for the barrel roll, `tab` pressed).
- `airStart(o)`: `{ap, lx?, lz, h, speed, thr, gear?, flaps?}` in the airport frame, heading toward local +Z. `NAV.lock` makes nav and ILS target the lesson airport.
- `#tutPanel` (top centre; `body.tut` moves `#cbBanner` down): step text, progress bar, Passer / Recommencer (R) / Quitter. A crash or a failed custom combat shows « Leçon interrompue »; success stores `DB.school.done[id]`.

**Missions hub** (`#msModal`, `window.SKYWAY_MISSIONS = {open(tab), toggle, startLesson, stopLesson, acceptOffer, refreshOffers, cancelContract, offers, tut, ct, LESSONS}`): tabs École / Transport / Combat. Combat opens `#cbModal`, which gets the same tab bar. `renderRecords` is wrapped to add transport totals and school progress.

## 9d. Platform extension: web ads, SEO, mobile app (last IIFE)
**SEO (in `<head>` / top of `<body>`)**: descriptive `<title>` and meta description, canonical URL, Open Graph and Twitter cards (`og-image.png`), `VideoGame` JSON-LD, icons and manifest, preconnects to the CDNs, a visually hidden `<h1>` (`.sr-only`), a `<noscript>` block, and « Guide du pilote · Confidentialité » links in the help panel (`.sitelinks`). The absolute URLs (`https://w2001-rf.github.io/skyway-3D-simulator/`) are repeated in `index.html`, `guide.html`, `privacy.html`, `sitemap.xml`, `robots.txt` and `mobile/src/config.ts`: change them all together for a custom domain.

**Web ads (AdSense H5 Games Ads, Ad Placement API)**
- `ADSENSE_CLIENT` (`ca-pub-` + 16 digits) at the top of the IIFE; empty = no ad script at all. Same ID in `guide.html` (`ADSENSE_CLIENT`, `ADSENSE_SLOTS`).
- No banner over the game: only interstitial `adBreak({type: 'next'})` at natural breaks, through `adBreak(name)`:
  - `resetFlight` after a flight ended (`AD.ended`, set by the wrapped `crash` and `finishLanding`), name « recommencer »;
  - `switchMap`, name « carte ».
- `adBreak` does nothing until `AD.played` ≥ `MIN_PLAY` (150 s counted while `!S.paused`); Google adds its own frequency cap (`data-ad-frequency-hint` 180 s). `?adtest=1` sets `data-adbreak-test="on"`.
- `beforeAd` / `afterAd` set `S.adPaused`, which `refreshPause` includes (so the sim and the engine sound pause during an ad).

**Mobile app bridge**
- `APP` = `window.SKYWAY_APP` (injected by the app before the page loads) or `?app=1` for desktop testing. In app mode: no AdSense, `body.app`, and the flight pauses when the page is hidden.
- Page → app: `window.ReactNativeWebView.postMessage(JSON)` with `{type: 'ready'}`, `{type: 'adBreak', name}` (same rules as the web ad breaks; the app applies its own cap and shows an AdMob interstitial), `{type: 'haptic', kind: 'crash'|'land'}`, `{type: 'privacyOptions'}`.
- App → page: `window.SKYWAY_PLATFORM = {app, adBreak, back(), pause(), adShowing(on), privacyLink(on), _ad}`. `back()` dispatches Escape through `padKey`; `privacyLink(true)` adds a « Choix publicitaires » link to the help panel when AdMob requires a way to reopen the consent form.

**`mobile/` (Expo SDK 57, React Native 0.86, TypeScript)**
- `App.tsx`: landscape lock, hidden status / navigation bars, splash held until `ready` (12 s fallback), `initAds()`.
- `src/GameScreen.tsx`: full-screen `react-native-webview` on `GAME_URL`, message handling, Android back button, background pause, haptics (`expo-haptics`), keep-awake, links other than the game page opened with `Linking`, offline / error overlay with retry.
- `src/ads.ts`: UMP consent (`AdsConsent.requestInfoUpdate` → `loadAndShowConsentFormIfRequired` → `canRequestAds`), then `mobileAds().initialize()` and a preloaded `InterstitialAd`. Cap: none in the first 3 min, 4 min between ads (`src/config.ts`).
- `src/config.ts`: `GAME_URL`, production ad unit IDs (empty = Google test units, always test units in `__DEV__`). `app.json` holds the AdMob App IDs (currently Google's public test IDs), the bundle ID `io.github.w2001rf.skyway`, and the plugin config.
- Tilt steering uses the page's own `deviceorientation` code inside the WebView (no native sensor bridge).
- Native module ⇒ development build required (`npx expo run:android`, or EAS). `android/` and `ios/` are generated (Continuous Native Generation) and gitignored: configure through `app.json` only. Checks: `npx tsc --noEmit`, `npx expo lint`, `npx expo-doctor`, `npx expo export`.

## 10. Known caveats / gotchas
- Terrain blocks many straight-in approaches (the survey probe measures clearance under a 3° path): on Vallée, VAL 36 is clear only within about 4.7 km (an 800 m ridge beyond), VAL 18 is cut by a 193 m hill at 2.8 km; LAC, NOR, SUD, EST and COT are clear from the south, CIM from the north; Hautes-Alpes has almost no clear straight-in approach. Place air-start lessons and scripted approaches inside the clear zone.
- The main script resets `settings.ac` to 'sirocco' when the saved id is unknown, because jets are defined later. The extension restores the saved jet from `Store.load()`.
- localStorage is blocked in claude.ai artifact previews. Records then live only for the session; Export works.
- `setAircraft` refuses while airborne. `startLevel` works around this by setting `S.crashed = true` before switching.
- Two `keydown` listeners exist (main + combat). Tab needs `preventDefault`; inputs and selects are ignored.
- Enemy/particle systems create a material per puff (capped at `GFX.puffs`, 250–900). Watch performance if you add more effects.
- New static scenery should respect the `GFX` budgets. Batch repeated small meshes with `instanced()` or per-tile instancing, because draw calls are the main cost. Typical frame: about 80 (Bas) / 160 (Élevé) / 230 (Ultra) draw calls.
- Scenery must go in `worldGroup` (not `scene`), or it survives map changes and leaks.
- `surfaceAt` and `deckAt` return shared objects (`SURF`, `DK`); copy the fields before calling them again.
- Map generation is synchronous: ~70 ms for heights, plus the color map (~0.2 s at 1024 px, more at 2048), plus the cities (the Métropole has ~10 000 buildings). In software rendering (SwiftShader) a full `loadMap` takes 0.75–1.5 s. `switchMap` shows `#loading` first.
- City materials and geometries (`MAT.bldgOffice`, `MAT.bldgFlat`, `MAT.roof`, `MAT.park`, `MAT.parkTree`, `MAT.cg_*`, `GEO.bldg`, `GEO.roof`, `GEO.parkTree`) are created once by `cityMats()` and kept across maps; each city's instanced meshes use geometry clones (disposed with the map).
- Enemy units, bullets and missiles ignore buildings (combat only runs on Vallée, whose towns are away from the mission areas).
- Headless Edge does not run requestAnimationFrame. Test physics by calling `physicsStep(1/120)` in a loop.
- `GFX`, `GPU` and `DB` are read before `init()`. `DYN` is declared next to `animate` and must exist before `init()` runs.
- `center(e)` and the temp vectors are shared; clone them before storing.
- Aircraft models are cached per type and cloned. Enemy wrecks clone their materials before darkening them; do the same for any per-instance material change.
- Livery canvases are painted the first time a type is built (about 0.1–0.3 s per type at `GFX.tex = 2`). Enemy types are built when they first spawn.
- The HTML contains a comment with the literal text `</body>` (before the combat extension). Test harnesses that inject scripts must insert before the LAST `</body>`.
- GitHub Pages serves the game as a *project* site under `/skyway-3D-simulator/`. Crawlers only read `robots.txt` and AdSense only reads `ads.txt` at the domain root, so with the github.io URL submit `sitemap.xml` in Google Search Console, and use a custom domain (or a `w2001-rf.github.io` user-site repo) for `ads.txt`.
- AdSense Auto ads must be disabled for the game page (AdSense › Ads › By site / URL exclusions), otherwise Google may overlay banners on the canvas. Only `guide.html` should use Auto ads.
- AdSense is not allowed inside apps: the page skips it when `window.SKYWAY_APP` is set, and the app uses AdMob instead. Keep it that way.
- Headless Edge enforces a minimum window width of about 500 px: phone-width screenshots are cropped, not reflowed. Measure layout with `innerWidth` / `scrollWidth` instead.

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
4. ~~Gamepad controls~~ (done). Pool the bullet/puff meshes.
5. Moving carrier (wind over deck), aircraft parked on the deck. ~~Landing aids~~ (done: PAPI, meatball, ILS needles).