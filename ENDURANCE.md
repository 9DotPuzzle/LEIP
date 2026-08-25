# ENX50 endurance — build notes

`endurance.html` is a **fork** of `index.html`, not a refactor of it. The two
files duplicate the THEME block, the terrain, the sea lanes, the correction
matrix and the port list, and that duplication is deliberate: `index.html` is a
frozen deliverable for Monaco and must keep working byte-for-byte. Nothing is
extracted into a shared module, nothing is deduplicated, and no common data file
is introduced.

Restore point for the Monaco build: branch **`monaco-v1`** (`ffdeab0`).
The check is `git diff monaco-v1 -- index.html`, which must be empty.

> **The feature branch `claude/leip-charter-game-build-n2qfg6` is the live Pages
> deploy target**, serving the public site from `/`. Nothing is pushed to it.
> All endurance work happens on `main`.
>
> `endurance.html` carries `<meta name="robots" content="noindex, nofollow">`.
> There is deliberately **no `robots.txt`** — it would be served from the deploy
> branch and would reach the live Monaco game.

---

## What was removed, and what survived

Removed: the entire scoring system (base ladder, five-factor multiplier, every
weight and band), the activities system and its UI, the Hare/Tortoise speed
toggle and the distance-based speed regression, nights-at-anchor, the countries
factor, the recharge factor, and the poster-parity override table with its
fixtures. With them went playback, achievements, results, the leaderboard and
the share card, all of which read from the score.

Kept unchanged: the Three.js scene, camera, lighting and day/night cycle; port
rendering and sea-lane path drawing; the 44×44 correction matrix; the port list
with coordinates, country, carbon and Category; and the prop power curve
constants.

Two things broke on the way, both worth knowing:

- **Label ranking had a hidden dependency on poster routes.** Names were ranked
  in three tiers, the middle being "ports a published poster charter uses". With
  `posterRoutes` gone, `D.posterRoutes.forEach` threw inside `initScene`, and
  because the app's WebGL fallback swallows the exception the page looked fine
  while rendering nothing. Ranking is now route-first, then alphabetical.
- **The DATA object's closing `};</script>` was carried off** with the
  `scoringExamples` block, which ran to the end of the literal.

---

## The model

`globalThis.ENX50_ENDURANCE` — pure. No DOM, no THREE, no RNG, no clock, no live
data. Same input, same output, every time. That is §5's hard requirement and the
reason a player who strands can always be shown the arithmetic that stranded
them.

```
model({ days, legs: [{ nm, speed }], stops: [name] })
  -> { valid, error,
       energy_kwh, underway_hours, anchor_hours,
       distance_nm, unique_pois, stranded, pe_mwh_delivered }

score(result, terminalCategory)
  -> { balance, utilisation, grid_bonus, score, tier, pe_mwh_delivered }
```

Every constant lives in `LEIP_DATA.endurance`; none is inlined at a call site.

- **Validity, not penalty.** An itinerary whose underway time exceeds its elapsed
  days returns `valid: false` with an explanatory `error`, and `score()` refuses
  it. It is not a scored deduction. Exactly `24 × days` is valid, with
  `anchor_hours` of zero.
- **`unique_pois` counts distinct stops.** A revisit adds nothing; five stops
  `A B A B A` is two POIs.
- **Only 8 / 11 / 14 kn.** Any other speed is rejected. Per §5 the curve is not
  extended below 8 kn: extrapolation puts the cheapest mile near 5.2 kn, and
  below roughly 3.6 kn underway draw falls under anchor draw, which would make
  moving cheaper than standing still.
- **Geometric mean, so a zero on any axis is a zero score.** No floor of any kind
  is applied to distance.
- **Utilisation multiplies.** Ending at 74% used caps the run at 74% of what the
  route earned.
- **PE is a tier, not a deduction.** `compare()` partitions the board: every PE
  run sorts below every ENX-only run whatever the raw score. A stranded run
  forfeits the grid bonus and reports `pe_mwh_delivered` in MWh.
- **The stranding artefact is left alone.** A stranded run always registers
  `utilisation = 1.0`, which flatters the raw number slightly. The tier
  separation already handles it; penalising utilisation would double-count.

---

## The map, and the debug readout on top of it

The scene is the Monaco one: 44 ports, their monuments, their name plates and
the sea-lane path drawing, all unchanged. What sits over it is temporary — a
`#end-debug` panel at the top of the planning sheet, above the port list so the
numbers are visible without scrolling. It exists to drive the model from a real
route rather than from a fixture array, and it is not the finished UI.

It carries: an elapsed-days field, a default speed for new legs, one row per leg
with an 8 / 11 / 14 selector and that leg's nm and MWh, and a readout of energy
used and remaining, days split into underway and at anchor, distance, unique
POIs, the terminal grid band and its bonus, the two factors, and the score with
its tier. Hovering a port chip shows what committing to it would cost, in MWh at
the default speed, before it is added.

`legsFromStops()` is the only place the correction matrix is applied — the map
gives geometry, and geometry becomes navigated distance exactly once.

### What was verified, and how

Counted from the live scene graph, not read off a screenshot:

```
port markers drawn      44   (= LEIP_DATA.ports.length)
monument meshes         165  (the markers are geometry, not empty groups)
name plates             44
selection marks         44
```

The named test itinerary **Antibes → Saint Tropez → Cannes** draws two legs,
28.1 nm and 23.5 nm. The plot canvas was sampled for non-transparent pixels —
28,914 of them, so the ink is real and not a mesh that is present but invisible.
Leg 1 starts at the Antibes berth, leg 2 ends at the Cannes berth, and the
shared waypoint is the same Saint Tropez berth on both legs, compared against
`berth()` rather than by eye.

The readout was driven through an add and a remove:

```
3 stops   51.6 nm | 33.40 MWh | POIs 3 | score 39.7
+ Monaco  72.7 nm | 34.10 MWh | POIs 4 | score 46.9
- Monaco  51.6 nm | 33.40 MWh | POIs 3 | score 39.7
```

Distance, energy, POIs and the rendered text all move on the add and return
exactly on the remove. Thirty assertions in total, none failing, no console
errors.

### The legs follow water

`debugSeaLane(from, to)` checks a leg against `LEIP_TERRAIN.coasts` — the same
rings the sea-lane router was built against and the same ones the map draws, so
the check is against what the player sees. It reports the vertex count, any
vertex inside land (even-odd parity accumulated across all rings, so a lake
reads as water), and how many times each **segment** cuts a coastline edge.

The segment test is the one that matters. Two sea points either side of Corsica
both pass a vertex test while the line between them runs over the mountains, and
a debug UI drawing that line is what gets screenshotted and misread.

```
Antibes -> Bonifacio   3 vertices   0 on land   0 coast crossings
  7.235,43.475 -> 8.765,41.515 -> 9.065,41.295
  the same two endpoints joined STRAIGHT: 6 coast crossings
```

The straight-line figure is the control. Without it, "0 crossings" could just
mean the leg had nothing to route around; with it, the lane is demonstrably
doing work. Swept over all **946 port pairs**: 870 carry routing waypoints, and
none has a vertex on land or a segment over land.

### The correction actually runs

Both Step 4 legs have a correction factor of exactly **1.0**, so their distances
are pure great-circle and the correction code was never exercised — the readout
would have been identical with the multiply deleted.

`debugCorrection(from, to)` drives the real path (`legsFromStops`, the one place
the matrix is applied) and compares the scored distance against great-circle ×
factor. Called with no arguments it sweeps every pair.

```
Ajaccio -> Bonifacio   basis corrected
  great-circle 37.10 nm  x 1.424  = 52.8304    scored 52.8304    delta 0
  15.7 nm apart from the raw figure — a skipped correction would be visible

sweep: 946 pairs checked, 918 with factor != 1, 0 mismatches
live readout on that route: distance_nm 52.8304, not 37.1000
```

The last line is the one that closes the gap: the corrected distance reaches the
rendered readout, not just the helper.

### The catch is loud here

`endurance.html`'s WebGL catch calls `console.error(e)` before falling back.
Proved by serving a deliberately broken THREE: the page fell back **and** the
exception was logged, which is the pair that `index.html` cannot produce. See
the bug note at the end.

---

## Distance correction — an unreconciled gap

The correction matrix converts point-to-point geometry into navigated distance.
It is applied in **`legsFromStops` only**, where legs are built from map
geometry. Fixture distances and the 362 nm baseline are already navigated
distances from the AIS set and are passed to `model()` untouched, so the
correction is never applied twice (spec §7.2).

**The two sources of that correction do not agree, and neither has been adjusted
to close the gap:**

| Source | Value |
|---|---|
| `leip_game_data.json` → `leg_correction.ratio`, over 946 unique pairs | median **1.131**, mean **1.402**, max **7.41** |
| The sheet's route-check ratios, cited in spec §7.2 | **≈ 1.52** |

The median is the honest comparison and it sits ~26% below the sheet's figure.
The *mean* is 1.402 and much closer, because the distribution has a long tail —
legs that must round a landmass reach ×7.41 (Genoa–Venice, the length of the
Adriatic) and drag the average up. So the two numbers may not be measuring the
same population at all: a median over every port pair, against route checks on
a handful of real charters that were probably typical passages rather than
circumnavigations of Italy.

It matters, because applied to leg geometry the correction scales `distance_nm`,
one of the three axes of the balance factor. Flagged, not resolved, and neither
value adjusted — resolving it means deciding which source is right and over what
population, which is a data question rather than a build one.

---

## Fixtures

`ENX50_ENDURANCE.runFixtures()` — callable from the console, prints a table with
a pass/fail per row at ±0.2.

```
fixture                        energy MWh          util           balance          score              tier
Fleet median @ 8 kn            43.706 vs 43.7      0.874 vs 0.87  1.000 vs 1       93.412 vs 93.4     ENX      PASS
Fleet median @ observed mix    56.930 vs 56.9      1.000 vs 1     1.000 vs 1       100.000 vs 100     PE 6.93  PASS
Balanced optimum               49.992 vs 50        1.000 vs 1     1.179 vs 1.179   123.915 vs 123.9   ENX      PASS
Hero                           49.992 vs 50        1.000 vs 1     1.486 vs 1.486   160.564 vs 160.6   ENX      PASS
Max distance                   49.921 vs 49.9      0.998 vs 1     1.284 vs 1.284   134.226 vs 134.2   ENX      PASS
Timid                          37.121 vs 37.1      0.742 vs 0.74  0.840 vs 0.84    68.337 vs 68.3     ENX      PASS
Dash                           49.643 vs 49.6      0.993 vs 0.99  0.361 vs 0.361   35.800 vs 35.8     ENX      PASS
Go-nowhere                     49.971 vs 49.97     0.999 vs 1     0.000 vs 0       0.000 vs 0         ENX      PASS

8 passed, 0 failed  (tolerance +/-0.2)
```

### Go-nowhere is amended

The spec table published **balance 0.042, score 4.2** for a run that never moves.
That row was computed with **0.1 nm** standing in as a divide-by-zero guard, and
the artefact reached the table — at 0.102 nm the arithmetic reproduces 0.042
exactly. §3's prose is authoritative and says the opposite: *"a zero on any axis
produces a zero score"*, given as the very mechanism that stops a player parking
in one port for eleven days, which is this fixture.

Corrected on the spec author's confirmation to:

| Fixture | Days | nm | POIs | Terminal | Energy | Util | Balance | Score |
|---|---|---|---|---|---|---|---|---|
| Go-nowhere | 11.04 | 0 | 1 | Grey | 49.97 | 1.00 | 0.000 | **0.0** |

There is no distance floor in the model and none should be added.

---

## Open items carried from the spec

1. **`BASE_POIS = 6` is assumed, not observed** (§7.1). Every other baseline comes
   from the AIS set; this one does not. Marked as an assumption in the DATA
   block. If BOAT Pro yields a median count of distinct stops per charter,
   substitute it — the fixtures move with it.
2. **The correction gap above** (§7.2), unreconciled by instruction.
3. **Score display scale** (§7.3). The raw range is roughly 0–160 with the fleet
   median at 93. If a 0–500 presentation is wanted for continuity with the
   Monaco build, that is a single display constant applied at the edge — not a
   change to the formula.

---

## A bug in `index.html`, reported and left alone

The no-WebGL fallback swallows its exception entirely:

```js
} catch (e) {
  S.webgl = false; G = null;
  show('webgl-fallback', true);
}
```

A scene that fails for a **code** reason is indistinguishable from a browser
without WebGL, and the page looks healthy while rendering nothing. This is
exactly how the label-ranking break above hid itself during the fork. One
`console.error(e)` in that catch would surface it. Not changed: `index.html` is
frozen — the report is accepted and logged for after Monaco.

`endurance.html` has that `console.error(e)`. It is the only intentional
divergence from the forked original in this area, and it is the reason a Step 4
failure would announce itself instead of rendering a healthy-looking blank map.
