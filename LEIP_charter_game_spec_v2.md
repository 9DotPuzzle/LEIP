# LEIP — Best Week of Charter
## Game Specification v2.0
*Supersedes v1 (leip_charter.html) in full. This is a fresh build, not a refactor.*
*Agreed: 5 August 2026 — Ben Cox, Christopher Mark, Ellis Karsenbarg, Felix Baines, Udham Singh*

---

## 1. Concept

The player plans a one-week Mediterranean charter aboard **LEIP** — a 70 m E-Hybrid superyacht with a **50 MWh battery** and diesel backup — then watches the charter play out on a 3D nautical chart.

The objective: **score the maximum "best week of charter."** Not the furthest week, not the laziest week — the *balanced* week. Energy discipline multiplied by charter quality. The design thesis the game must teach through play:

- **Travel is the energy story.** Distance and speed dominate consumption; onboard activities are deliberately marginal.
- **Anchor time is the reward.** Time at anchor is guest-enjoyment time — but going nowhere is not a charter.
- **The battery is the boundary.** Stay under 50 MWh and the diesels never wake. Exceed it and they do — quietly.

**Fixed and out of the player's hands:** guest count, crew count, the vessel itself, AC/climate settings (removed by design — the system is efficient, full stop), and mid-charter recharging (none — battery + diesel only until the final port).

---

## 2. Player Inputs & UX Flow

The planning screen, in order:

1. **Starting port** — picked from the chart. Battery starts at 100% regardless of port.
2. **Destinations** — additional ports/points of interest, picked in order; **the pick order is the route**. Locations may be selected more than once. Infeasible/doomed routes are **allowed** — the simulation runs them and the score suffers; nothing is blocked upfront. **The final pick is the recharge port**, where the batteries refill for the next charter — its energy quality is scored (see §5).
3. **Speed** — one **global fast/slow toggle** for the whole charter. Each position maps to a speed-time distribution derived from AIS data (see §4). Fast covers distance quicker (more anchor hours, higher draw); slow is gentler (more hours underway).
4. **Nights at anchor** — 0–6. Authentic charter behaviour (real-world charterers target 4–5 anchor nights/week). Mechanically: nights spent anchored are nights *not* spent transiting, so the same route consumes more daytime. Scored in the multiplier with its peak at the real-world 4–5 sweet spot.
5. **Activities** — two categories, **Relaxing** and **Active**. Each activity is flagged **once-only** or **repeatable** (with a max count), within the capacity of **7 days / 6 nights**. Activity energy factors are deliberately tiny (fractions of a %). Activities are independent of the route — they do not require anchor hours. Parties are a repeatable activity; excessive repeats decay the fun factor ("party too many times").
6. **Random Spin** — randomises *everything* above. Genuinely chaotic: doomed routes, absurd itineraries and terrible scores are all possible outcomes. No sanitising.
7. **Simulate Charter** — locks inputs and runs the playback. No mid-simulation input changes in v1.

---

## 3. Simulation Model

- **Time budget:** 7 days / 6 nights (168 h).
- **Distances:** haversine between true port coordinates.
- **Underway model:** route distance is covered according to the speed-time distribution of the chosen toggle position. Energy = Σ(time in band × power at band speed) from the prop curve.
- **Hotel load:** one fixed kW constant, drawn 24/7 for the full week, sourced from the engineering sheets. This is the majority of real consumption and must be present for poster parity to reconcile.
- **Activities:** small additive factors per selection, per the activities file.
- **Anchor hours (derived):** whatever remains of the week after the route is covered. This derived figure feeds the anchor-time experience, distinct from the nights-at-anchor input.
- **Battery:** starts 100 % (50 MWh usable). Consumption draws it down; **no recharging mid-charter**. When cumulative demand exceeds 50 MWh, diesel generation covers the remainder.
- **The diesel moment:** during playback, the only cue is **subtle smoke** in the animation — no message, no HUD alert. The truth is revealed at the results screen. (The "50 MWh Hit" achievement fires silently at the moment it happens.)
- **Weather / sea state:** **cosmetic only** in v1. Live data (Open-Meteo) may drive visuals with graceful offline fallback, but has **zero effect** on energy, timing, or score. A rules hook may later map weather to score — parked.
- **Day/night cycle:** visual cycle across the week; night transits vs anchored nights reflect the player's nights-at-anchor choice.
- **Determinism:** identical inputs must always produce identical outputs. No live data in the math. This is a hard requirement (poster parity, §6).

---

## 4. Data Architecture

The game contains a single, clearly-marked **DATA block** that mirrors the team's simplified Excel sheets **one-to-one**. Placeholder values ship first; real values drop in without translation. All balance constants (weights, thresholds, factors) live here — never hard-coded in logic.

| # | Dataset | Owner | Shape |
|---|---------|-------|-------|
| 1 | **Prop analysis** — simplified underway curve | Chris | `speed_kts → power_kW` (~6–10 rows), mode labels if available (Electric / Hybrid / Transit / Boost for the HUD); hotel-load constant (kW) |
| 2 | **AIS speed distributions** | Ben | Per toggle position: `% of underway time per speed band`. Open item: one fleet-average distribution (fast/slow derived as offsets) vs two genuine observed profiles — resolved when data lands |
| 3 | **Destinations & charging** — combined ports list | Felix + Udham | Port name, country, lat/lon, energy type (**green / blue / grey / brown** — four types only), pre-computed charge ranking, destination-vs-charging-port designation, tags (`dive`, `achievement:*`) |
| 4 | **Reference routes** — the five poster routes | Felix | Ordered port list + published MWh per route, **same assumptions as the sheets** |
| 5 | **Activities file** | Ellis (drafted by Claude, team adjusts values) | Activity, category (Relaxing/Active), `repeatable` flag + max count, fun score, eco score. Same fun weighting across activities; eco varies |

Notes:
- Load balance data: **crossed out** at the meeting — not used. Activities carry simple factors instead.
- Country-level shore-charging analysis (Udham) feeds the port rankings *upstream*; the game only ever sees the combined sheet.
- Geographic scope v1: Western Med core (French Riviera, Italy/Liguria, Corsica, Balearics) + deliberately thin Eastern Med (≈3 Greek ports incl. Santorini, 1 Turkish, Cyprus) — enough to make 3-countries and Santorini achievable. Adding ports later is a data-only change.

---

## 5. Scoring

**Final score = Base × Multiplier.** Theoretical ceiling 1,000. Negative scores are possible and intended.

### Base (0–100) — pure energy performance
Distance travelled vs MWh consumed, and diesel discipline (staying inside the 50 MWh battery). Computed **entirely from the engineering data**. Nothing experiential contaminates it. A charter completed on battery with strong nm-per-MWh efficiency scores high; diesel hours are the dominant penalty.

### Multiplier (−10 to +10) — charter quality
Five factors, each scored −10…+10, **averaged**:

| Factor | Behaviour |
|--------|-----------|
| Countries visited | Genuine multi-country exploration outranks port-hopping in one country |
| Ports visited | Variety rewarded; repetition flat |
| Activities | Balanced mix rewarded; repeat-spam (e.g. party ×7) decays |
| Nights at anchor | Peaks at the real-world 4–5 sweet spot; tapers below; go-nowhere extreme penalised |
| Final-port recharge | Green best → blue → grey → brown worst |

Averaging is intentional: a neglected factor at 0 drags the average — balance is structurally required. Realistic excellence ≈ 700s; the 900+ ceiling is achievement territory.

**Worked example (canonical test case):** base 78, multiplier 6.2 → **483.6**. The build must reproduce this exactly from a defined input set before any 3D work begins.

---

## 6. Poster Parity — hard requirement

If a player replicates one of the five poster routes exactly, the game **must output the published figure** (e.g. Monaco route ≈ 47–48 MWh).

Strategy: **calibration first, override as safety net.**
1. Simulate from first principles; tune constants until all five routes land within **±1 MWh** of their published figures.
2. If any route cannot be reconciled, an exact-route-match check snaps the output to the published number.
3. Poster routes ship in the DATA block as automated regression tests.

This is also why achievements never affect scoring and weather never touches the math: the board number cannot depend on who is playing or what day it is.

---

## 7. Achievements — the nine dots

Pure **easter-egg collection layer**. Zero effect on score. Persistent across plays via `localStorage`.

Presentation: nine unlabelled dots arranged in the **nine-dot pattern**. No names, no hints until earned. Unlock fills the dot and reveals the name — some fire mid-simulation (silently, at the moment of trigger), others at results. **All nine unlocked: the arrow pattern draws itself through the dots** (the Lateral logo moment).

| # | Name | Trigger | Type |
|---|------|---------|------|
| 1 | Green Charge | Finish at a green-energy port | Per-charter |
| 2 | Score Over 900 | Final score > 900 | Per-charter (near-mythical) |
| 3 | 50 MWh Hit | Wake the diesels | Per-charter, fires mid-sim |
| 4 | Submerged Ruins | Dive activity at a `dive`-tagged location | Per-charter |
| 5 | The Five Routes | Complete all five poster routes | Cumulative |
| 6 | Long Haul | > 400 nm in one charter | Per-charter |
| 7 | World Traveller | 3 countries in one week | Per-charter |
| 8 | Volcano Chief | Reach Santorini | Per-charter, fires mid-sim |
| 9 | Repeat Client | Three charters above a score threshold | Cumulative |

All thresholds (400 nm, 900, Repeat Client bar, etc.) are **editable constants** in the DATA block for playtest tuning.

---

## 8. Presentation & Playback

- **Visual:** top-down isometric 3D nautical chart (Three.js via CDN), 3D yacht with wake, day/night cycle, port pins, route line. Retains the v1 visual direction; implementation is fresh.
- **HUD during playback:** current mode (Electric / Hybrid / Transit / Boost — from the prop curve's mode labels), speed (kts), battery %, current leg, day counter. No diesel warnings (smoke only).
- **Skip** button jumps to results.
- **Results screen:** final score with the Base × Multiplier breakdown, distance (nm), MWh used, battery vs diesel split (the reveal), ports & countries, anchor nights, activities, recharge-port verdict with its *why* ("finished on Cypriot diesel — full batteries, at a cost"), and any achievements earned.

---

## 9. Platform & Deployment

- **Single self-contained HTML file** (external CDN for Three.js only). Works from `file://` and static hosting.
- **Desktop + mobile browsers**; touch and mouse input; responsive layout.
- **Deployment target: GitHub Pages** from the repo.
- Graceful degradation: no WebGL → readable error; no network → cosmetic weather falls back to defaults (math unaffected by design).

---

## 10. Explicitly Out of Scope (v1) — the back pocket

| Item | Status |
|------|--------|
| Per-leg speed selection | Parked — replayability lever for v2 |
| In-game live speed control during playback | Parked — related to per-leg decision |
| Weather affecting score | Parked — cosmetic only; rules hook noted |
| Prohibited areas / instant-loss ("naval, go to jail") | Parked — back pocket |
| Per-day drag-and-drop itinerary builder | Parked — "get it working first" |
| Guest/crew/vessel selection | Removed — fixed by design |
| AC / climate selection | Removed — by design |
| Mid-charter recharging | Removed — by design |
| Achievement score effects | Rejected — achievements are trophies only (§5, §6) |

---

## 11. Validation Requirements (before the build is "done")

1. **Headless smoke test** — stubbed Three.js/DOM harness executing boot → scene build → full planning → simulation → playback → results (the v1 crash class must be caught pre-delivery).
2. **Scoring canonical test** — the worked example (§5) reproduces 483.6 exactly.
3. **Poster parity tests** — all five reference routes within ±1 MWh of published figures (or override engaged and logged).
4. **Balance scenarios** — at minimum: modest local charter (high base, low multiplier), balanced multi-country (the intended optimum), diesel-soaked dash (low base × high multiplier), go-nowhere anchor week (high base × low/negative multiplier). Each must land in its intended score band.
5. **Determinism test** — identical inputs, repeated runs, identical outputs.
6. **Random Spin test** — spins produce valid (if chaotic) input sets that always simulate without error.

---

## 12. Build Notes for the Implementing Session

- Build **fresh**. Do not port v1 code; v1 is reference for visual direction only.
- Implement and validate the **scoring engine first** (headless, against §5 and §11.2–4) before any rendering work.
- Placeholder data must be **loudly marked** (`// PLACEHOLDER — awaiting <owner> sheet`) and structured exactly per §4 so real sheets drop in.
- Every tunable lives in the DATA block. If a number appears in game logic, it's a bug.
- The repo write-permission issue from the previous session may still be outstanding; deliver the file directly if pushes fail.
