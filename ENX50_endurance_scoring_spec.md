# ENX50 endurance mode — scoring specification

Version 1.0. All constants sourced from `Game_Inputs.xlsx` unless marked otherwise.

---

## 1. Energy model

Single fixed budget. No mid-charter recharge. The run ends when the player elects to
finish, or when demand exceeds the battery.

| Constant | Value | Source |
|---|---|---|
| `BATTERY_CAPACITY_KWH` | 50000 | platform spec |
| `HOTEL_ANCHOR_KW` | 188.6 | Propulsive Power Requirement, 0 kn row |
| `HOTEL_UNDERWAY_KW` | 162.8 | Propulsive Power Requirement, 8/11/14 kn rows |
| `PROP_KW[8]` | 291.46688556113304 | as above |
| `PROP_KW[11]` | 771.7994251386181 | as above |
| `PROP_KW[14]` | 1845.8204811843182 | as above |

Energy for a run, in kWh:

```
underway_hours = sum(leg.nm / leg.speed for leg in legs)
anchor_hours   = 24 * days - underway_hours
E = sum((leg.nm / leg.speed) * (HOTEL_UNDERWAY_KW + PROP_KW[leg.speed]) for leg in legs)
  + anchor_hours * HOTEL_ANCHOR_KW
```

`anchor_hours` must never go negative — reject any itinerary whose underway time
exceeds the elapsed days. This is a validity check, not a scoring penalty.

Derived quantities, for reference and for balance testing:

- Static endurance: 50000 / (188.6 × 24) = **11.05 days**
- Maximum distance: continuous 8 kn = **881 nm** over 4.59 days
- Marginal cost of a mile, relative to staying at anchor:
  8 kn → 33.21 kWh/nm · 11 kn → 67.82 kWh/nm · 14 kn → 130.00 kWh/nm

---

## 2. Baseline

The index is anchored on the observed AIS charter set (28 charters, 124–642 nm).

| Baseline | Value | Source |
|---|---|---|
| `BASE_DAYS` | 7.0 | charter week |
| `BASE_NM` | 362.0 | **median** of the 28 observed charters |
| `BASE_POIS` | 6 | **assumed — not yet derived from data.** See §7 |

A player who exactly reproduces the median fleet itinerary scores a balance factor of
1.000. Note this itinerary is *not* achievable at the speed mix those yachts actually
used — at observed speeds it costs 56.9 MWh and strands. At 8 kn it costs 43.7 MWh.
That gap is the intended lesson of the mode and should not be balanced away.

---

## 3. Score

```
d = days / BASE_DAYS
n = distance_nm / BASE_NM
p = unique_pois / BASE_POIS

balance     = (d * n * p) ** (1/3)
utilisation = min(energy_used_kwh / BATTERY_CAPACITY_KWH, 1.0)

score = 100 * balance * utilisation + grid_bonus
```

**Geometric mean, not sum.** A zero on any axis produces a zero score. This is the
mechanism that stops a player parking in one port for eleven days, and equally stops a
pure distance dash.

**Utilisation is a multiplier, not a bonus.** Finishing with reserve caps the score
proportionally: ending at 74% used caps you at 74% of what the route earned. Unspent
capacity is a planning failure.

`unique_pois` counts distinct locations only. Returning to a location already visited
adds nothing — without this, the optimal strategy degenerates into a two-port shuttle.

### Grid bonus

Applied once, on the terminal charge, from the `Category` column in `Locations`:

| Category | Ports | Range (gCO₂e/kWh) | Bonus |
|---|---|---|---|
| Green | 11 | 32–135 | +12 |
| Blue | 15 | 174–298 | +6 |
| Grey | 7 | 352–440 | 0 |
| Brown | 11 | 483–543 | 0 |

Additive, so it reads as a distinct decision rather than a distortion of the core index.
Display the gCO₂e/kWh figure at each candidate terminal port. **Do not** render this as
a leaf icon, an eco rating, or a "green points" label — it is a measured grid intensity
figure and should be presented as one.

No bonus is awarded to a stranded run.

---

## 4. Passage Extender

If cumulative demand exceeds 50 MWh, the run is **stranded**. The Passage Extender
covers the shortfall, the run completes, and:

- `pe_mwh_delivered = (E - BATTERY_CAPACITY_KWH) / 1000`, displayed on the results screen
- the run is tagged `PE` on the leaderboard
- **all PE runs sort below all ENX-only runs, regardless of raw score**

This is a tier separation, not a points deduction. A charter that needed the Passage
Extender was planned wrong, and no amount of distance redeems it. Report PE output in
MWh delivered — not litres, not CO₂.

Note a known artefact: a stranded run always registers `utilisation = 1.0`, so stranding
slightly flatters the raw number. The tier separation makes this harmless, but do not
"fix" it by penalising utilisation — that would double-count.

---

## 5. Determinism

Hard requirement. No weather effects, no random events, no hidden information. The
player must be able to see the exact MWh cost of any leg before committing to it. If a
player strands, it must be arithmetic they got wrong, never luck. Weather may drive
visuals only, with zero effect on energy, timing or score.

The speed selector should show live MWh cost as it is dragged. At the three available
speeds, 8 kn is strictly dominant — this is intentional and must not be balanced away.
Faster speeds exist to be reached for and regretted.

**Do not extend the speed curve below 8 kn.** Extrapolation puts the cheapest mile
around 5.2 kn, and below roughly 3.6 kn underway draw falls below anchor draw, making
movement cheaper than stillness. The 8 kn floor in the sheet is load-bearing.

---

## 6. Regression fixtures

Speeds given per leg. Expected values computed from the constants above; tolerance ±0.2.

| Fixture | Days | nm | Speed | POIs | Terminal | Energy | Util | Balance | **Score** |
|---|---|---|---|---|---|---|---|---|---|
| Fleet median @ 8 kn | 7.00 | 362 | 8 | 6 | Blue | 43.7 | 0.87 | 1.000 | **93.4** |
| Fleet median @ observed mix | 7.00 | 362 | 34/287/41 @ 14/11/8 | 6 | Blue | 56.9 | 1.00 | 1.000 | **100.0 · PE 6.9** |
| Balanced optimum | 5.52 | 753 | 8 | 6 | Blue | 50.0 | 1.00 | 1.179 | **123.9** |
| Hero | 5.52 | 753 | 8 | 12 | Green | 50.0 | 1.00 | 1.486 | **160.6** |
| Max distance | 4.58 | 879 | 8 | 8 | Blue | 49.9 | 1.00 | 1.284 | **134.2** |
| Timid | 6.00 | 300 | 8 | 5 | Blue | 37.1 | 0.74 | 0.840 | **68.3** |
| Dash | 1.03 | 346 | 14 | 2 | Grey | 49.6 | 0.99 | 0.361 | **35.8** |
| Go-nowhere | 11.04 | 0 | — | 1 | Grey | 50.0 | 1.00 | 0.042 | **4.2** |

The balanced optimum falls where each axis consumes half the budget — 25 MWh on days,
25 MWh on miles. Expect skilled players to converge on roughly 5.5 days and 750 nm.

---

## 7. Open items

1. **`BASE_POIS` is assumed, not observed.** Every other baseline comes from the AIS
   set; this one does not. If BOAT Pro can yield a median count of distinct stops per
   charter, substitute it and re-derive the fixtures. Until then it should be marked as
   an assumption in code comments.
2. **Distance correction factor.** The existing build applies a 1.52× correction to
   convert point-to-point distance to navigable distance. The 362 nm baseline is taken
   from the sheet's observed totals, which are already real navigated distances —
   confirm the correction is not applied twice.
3. **Score display scale.** Current range is roughly 0–160 with the fleet median at 93.
   If a 0–500 presentation is wanted for continuity with the previous build, multiply by
   a single display constant rather than altering the formula.
