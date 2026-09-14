# Decision log

Jot these down AS YOU GO, not at the end — you won't remember the "why" in
4 hours, and this is exactly what the closing walkthrough will probe.

Template per entry:

## [HH:MM] Decision title

- **Context:** what prompted this decision
- **Options considered:** A vs B (vs C)
- **Chose:** X
- **Why:** the actual reasoning
- **Trade-off / what I gave up:**

---

## [00:00] Example entry — delete me

- **Context:** Needed to decide how to model X.
- **Options considered:** Normalize into two tables vs. a single JSON column.
- **Chose:** Two tables.
- **Why:** Queries need to filter on the nested field; JSON column would
  require app-side filtering at this data size.
- **Trade-off:** Slightly more migration boilerplate up front.

---

## [00:49] Fix Prisma CLI / client version mismatch in scaffold

- **Context:** During an initial walkthrough of the scaffold, `npm run db:generate` and `npm run db:push` both failed with `MODULE_NOT_FOUND` on `generator-build/index.js`. Root cause: `package.json` pinned `prisma` (CLI) to `^5.19.1` but `@prisma/client` to `^7.10.0` — Prisma 7's client dropped the legacy generator entrypoint the 5.x CLI expects. This would have broken `npm run setup` on any fresh clone and failed CI at the `db:generate` step.
- **Options considered:** (a) downgrade `@prisma/client` to `^5.19.1` to match the CLI vs. (b) upgrade the `prisma` CLI + schema to v7 (add generator `output`, verify `vitest-mock-extended` compatibility).
- **Chose:** (a) — downgrade `@prisma/client` to `^5.19.1`.
- **Why:** Smaller, lower-risk change; keeps the existing schema and code as-is and matches the rest of the v5-era scaffold conventions.
- **Trade-off / what I gave up:** Stuck on Prisma 5 instead of latest; would need to revisit if the take-home ends up needing a v7-only feature. Verified the fix with a real `npm install` + `db:generate` + `db:push` + typecheck + lint + test run — all green.

---

## [13:00] Lemonade stand data model (GameState/Day/Purchase) and pure-function demand design

- **Context:** The real prompt arrived as a full lemonade-stand simulation game (buy inventory → price → simulate a day → repeat until bankrupt), replacing the placeholder `Item` CRUD scaffold. Needed a data model that supports weighted-average cost-of-goods and a demand formula that's actually unit-testable.
- **Options considered:** (a) a single `GameState` row storing only current totals vs. (b) `GameState` (singleton) + `Day` (per-day history) + `Purchase` (per-purchase log); for demand, (a) generate randomness inside the function vs. (b) pass `randomFactor` in as an explicit argument.
- **Chose:** (b) for both — the three-table split, and `calculateDemand`/`calculateMaxSellable`/`isBankrupt` as pure functions that take all their inputs explicitly (including randomness).
- **Why:** Weighted-average COGS requires knowing the cost of each individual purchase, not just a running stock total, so `Purchase` rows are load-bearing, not just a nice-to-have log. Keeping `Math.random()` out of `calculateDemand` (call sites pass it in) and extracting `isBankrupt`/`calculateMaxSellable` as pure functions makes the core simulation rules deterministically testable without mocking Prisma or the RNG.
- **Trade-off / what I gave up:** `Day` and `Purchase` have no `gameId` foreign key, so history isn't scoped per game session — starting a new game (`POST /api/game`) has to explicitly wipe `Day`/`Purchase` rows to avoid overlapping `dayNumber`s from a prior run. Acceptable given the stated non-goal of persistence beyond a single local session.

---

## [13:25] Fix PRICE_ELASTICITY: "Run the day" was always returning zero demand

- **Context:** Bug report: every "Run the day" call returned Demand 0 / Sold 0 / Revenue $0 regardless of price or weather. Systematically ruled out the obvious coding-bug patterns first — no `|| 0` fallback, constants import correctly (verified with a throwaway script logging every intermediate value), `unitsDemanded` genuinely comes from `calculateDemand`'s return, `Math.random()` is called with parens. Isolated `calculateDemand(...)` directly and it returned a correct nonzero value. Pulled the real `/api/game/history` off the live dev server and found every price actually tried was $1 or higher.
- **Options considered:** (a) treat this as a UI/UX-only problem (add a price hint) and leave the constants alone vs. (b) fix the constants themselves, since the live nonzero-demand price window was a config defect, not the intended design.
- **Chose:** (b) — lowered `PRICE_ELASTICITY` from 1.2 to 0.5 in `gameConfig.ts`.
- **Why:** `priceMultiplier` clamps to exactly 0 once `price >= BASE_PRICE * (1 + 1/PRICE_ELASTICITY)`. At 1.2 that threshold was ~$0.92 — any price of $1+ (an entirely reasonable guess for a "price per cup" field) produced hard-zero demand every time, which is exactly what was reported. This wasn't a logic bug (the formula and its implementation matched spec exactly); it was a degenerate combination of two "arbitrary/tunable" constants that made the core game loop effectively unplayable at normal prices. Verified the fix live: $0.50 → demand 61, $1.00 → demand 21, $1.50 → demand 0 (new threshold, exactly as predicted), full buy→sell→profit loop confirmed working end-to-end.
- **Trade-off / what I gave up:** None functionally — this is exactly the kind of tuning adjustment the constants file already disclaims as arbitrary. Added a regression test asserting an *absolute* positive demand value at a realistic above-base price ($1), since the existing directional tests (`toBeGreaterThan`/`toBeLessThan`) never exercised a price outside the immediate BASE_PRICE neighborhood and so never caught how narrow the live window had become.

---

## [13:42] Cash double-counted COGS; suggestPrice uses grid search, not calculus

- **Context:** Confirmed hypothesis that `setPriceAndSimulateDay` computed `cashAtEnd = game.cash + profit`. `buyInventory` already deducts the full ingredient cost from cash the moment it's purchased, so adding `profit` (`revenue - cogs`) at day's end subtracted that same cost a second time — cash was silently running lower than it should. Separately, needed a `suggestPrice` function to recommend a profit-maximizing price for the day, given the same nonlinear, clamped `calculateDemand` formula.
- **Options considered:** For cash: (a) leave `cash += profit` and instead stop deducting cost at purchase time (accrual-style accounting) vs. (b) keep purchase-time deduction and change to `cash += revenue`. For price suggestion: (a) solve the profit-maximizing price in closed form via calculus on the demand formula vs. (b) a linear grid search evaluating `calculateDemand` at N candidate prices and taking the argmax.
- **Chose:** (b) for both — `cash += revenue` (profit stays a stored/reported field only); grid search over `priceMin..priceMax` in `steps` increments.
- **Why:** Cash: purchase-time deduction is the simpler mental model (cash reflects money actually spent/received as it happens) and matches how `buyInventory` already worked — changing the deduction timing would have meant no longer subtracting cost when you actually pay for ingredients, which is backwards. Price suggestion: `calculateDemand` includes a `clamp(...)` and a `Math.round(...)`, so it isn't smooth/differentiable — there's no clean closed-form optimum to solve for, and grid search reuses the exact same pure function the real simulation uses (no risk of the optimizer and the simulator disagreeing about what demand *is*), at the cost of only being an approximation at the grid's resolution.
- **Trade-off / what I gave up:** Grid search is $O(\text{steps})$ per call instead of $O(1)$, and its precision is bounded by `steps` (default 60 across a $0–$1.50 range ≈ 2.5¢ resolution) — acceptable for a UI suggestion button, not for anything latency-sensitive. Extracted `costPerCup(game)` and `maxSellableByInventory(inventory, recipe)` as standalone pure functions (previously inlined in `setPriceAndSimulateDay`) so both the real day-resolution path and `suggestPrice`'s route handler compute these identically from the same source.

---

## [14:06] Explicit unit-by-unit sales loop; peopleTurnedAway instead of a redundant field

- **Context:** `setPriceAndSimulateDay` computed `unitsSold` in closed form as `min(demand, maxSellableByInventory)`. Wanted to (a) make the sale-resolution logic transparent/steppable rather than a single formula, so per-customer variation (different order sizes, walk-away behavior) is a small future change instead of a rewrite, and (b) surface how many people were turned away on a sold-out day, for both the UI and the Day history.
- **Options considered:** For the loop: (a) keep the closed-form `min()` and just derive `peopleTurnedAway = unitsDemanded - unitsSold` from it vs. (b) replace it with an explicit `for` loop serving one customer at a time via a new `canMakeOneMoreCup(inventory)` check, breaking on the first customer that can't be served. For the new field: (a) add both `peopleTurnedAway` and a separate "number of people demanded" field vs. (b) add only `peopleTurnedAway`, since `unitsDemanded` already *is* the number of people (the recipe is 1 cup per person).
- **Chose:** (b) for both — the explicit loop, and only `peopleTurnedAway` (no redundant people-count field).
- **Why:** The loop and the old formula are mathematically identical today (proved by a regression test comparing both), so this was purely an architecture change, not a bug fix — the loop is the natural place to hang future per-customer logic (e.g. some customers wanting more than one cup, or leaving before checking price) without re-deriving a closed-form formula each time behavior changes. A second "people" field would just duplicate `unitsDemanded` under a different name and could drift out of sync with it; `peopleTurnedAway = unitsDemanded - unitsSold` is the only genuinely new information.
- **Trade-off / what I gave up:** The loop is O(demand) instead of O(1) — irrelevant at this game's scale (demand tops out around 100-150/day) but worth knowing if `BASE_DEMAND` were ever pushed much higher. Reused the existing `Day.endedEarly` field for "sold out" rather than adding a same-meaning `soldOut` column, per the instruction not to have two fields meaning the same thing.

---

## [14:32] Chart loss-zone design; resetGame() as a full wipe (no gameId FK yet)

- **Context:** Two things. (1) The history chart's `YAxis` had no explicit `domain`, so it inherited recharts' default `[0, 'auto']` — confirmed by reading the code before touching it, this silently clips any negative `profit` value to the bottom axis line instead of letting it dip below, exactly the kind of bug that only visual inspection catches (a manual browser check during this session did in fact turn up a second real bug: unrounded floating-point tick values combined with a `left: 0` chart margin were rendering garbled axis labels like "9999998" instead of "$22" — fixed alongside the domain work). (2) `DELETE /api/game` ("Exit Game") needed a `resetGame()` that actually deletes the GameState row, not the existing one (used by "start a new game") which reset it in place.
- **Options considered:** For the axis: (a) leave `domain` implicit and just rely on the loss dot's red color to imply a negative value vs. (b) compute an explicit `[min, max]` domain from the actual history data (profit's min, both series' max, padded ~10%) plus a `ReferenceLine`/`ReferenceArea` for an explicit zero crossing and loss band. For `resetGame()`: (a) keep two differently-named reset functions (one that recreates, one that deletes) vs. (b) make `resetGame()` itself the full delete (Purchase, Day, and GameState rows) and have the "start a new game" route compose it with `getOrCreateGame()` afterward.
- **Chose:** (b) for both — explicit padded domain + zero reference line/area + loss-colored profit dot; and a single `resetGame()` that always fully deletes, reused by both `POST /api/game` (wipe + recreate) and `DELETE /api/game` (wipe only).
- **Why:** An implicit domain silently hides the exact scenario (a loss) the feature exists to surface — worth the extra ~10 lines to compute it explicitly and prove it visually rather than trust it from code review alone. One `resetGame()` function with one meaning ("delete everything") is simpler to reason about than two similarly-named functions that differ only in whether they recreate afterward; composing at the call site (`resetGame()` then optionally `getOrCreateGame()`) is a one-line difference between the two routes.
- **Trade-off / what I gave up:** `resetGame()` deletes *all* Day/Purchase/GameState rows rather than scoping the delete to one game, because neither `Day` nor `Purchase` carries a `gameId` foreign key back to a specific `GameState` — the schema still assumes exactly one active game ever exists. Scoping "exit"/"reset" to a specific game session (so e.g. multiple browser tabs or a future multi-game history wouldn't stomp on each other) would require adding that FK; noted here as a future consideration, not built now since it's out of scope for a single-player local session.

---

## [14:41] Fix demand noise: raw Math.random() was being used as the multiplier itself

- **Context:** Demand swings looked implausibly wide. Confirmed before fixing: `calculateDemand`'s call site in `setPriceAndSimulateDay` passed `Math.random()` (uniform 0-1, mean 0.5) directly as `randomFactor`, which the formula then multiplies straight into `BASE_DEMAND * priceMultiplier * weatherMultiplier * randomFactor`. Quantified it with a 1000-sample script at the base case (price=BASE_PRICE, normal weather): mean 49.30-51.40 (should be ~100), min 0, max 100, stddev ~29-30 — a roughly uniform spread across the whole range, not noise around an expected value.
- **Options considered:** (a) change `calculateDemand`'s internal formula to remap `randomFactor` itself vs. (b) keep `calculateDemand` untouched (still a pure function taking `randomFactor` literally as a multiplier) and instead fix how the *call site* generates that value, using a new `DEMAND_NOISE_RANGE` constant to build a factor centered at 1.0 (`1 - range + Math.random() * 2*range`).
- **Chose:** (b).
- **Why:** `calculateDemand` was never actually the buggy code — it does exactly what a demand formula should do with whatever multiplier it's handed; the bug was entirely in what value the caller handed it. Fixing it at the call site keeps `calculateDemand`'s signature and pure-function contract completely unchanged (still directly unit-testable with any explicit `randomFactor`), while `suggestPrice` — which passes a literal fixed `1`, verified unchanged and unaffected — stays correct without any special-casing.
- **Trade-off / what I gave up:** None significant. Re-ran the same 1000-sample script after the fix: mean 100.07, min 80, max 120, stddev 11.57 — matching the theoretical uniform-distribution stddev for a ±20% range (~11.55) almost exactly. Added a 200-sample mean-tolerance test (`gameService.test.ts`) that would have caught the original bug outright, since the existing directional tests ("higher price → lower demand") pass regardless of where the noise is centered and never would have.

---

## [14:55] Variance-day detection: rolling z-score, tunable thresholds, both directions, own module

- **Context:** Wanted to flag days whose profit is a statistical surprise relative to recent play — both unusually good and unusually bad — with a plain-language explanation of likely causes (price, weather, sellouts, demand), surfaced in the day-result panel, the history chart, and a dedicated list.
- **Options considered:** For the statistic: (a) a fixed absolute profit threshold (e.g. "$20 swing = variance") vs. (b) a z-score against a trailing rolling window of the player's own recent profits, so "unusual" is relative to how volatile *this* game has actually been. For scope: (a) flag losses only (reusing the existing loss-styling machinery) vs. (b) flag both directions, since an unusually *good* day is just as informative a signal as a bad one. For code location: (a) add these functions to `gameService.ts` alongside everything else vs. (b) a new `src/lib/variance.ts` module.
- **Chose:** (b) for all three — rolling z-score, both directions, and a separate `variance.ts` module.
- **Why:** A fixed threshold means nothing without knowing the game's baseline volatility (a $20 swing is huge on day 2 with $6 profits, unremarkable by day 30 with $80 profits) — a z-score against the player's own trailing window self-calibrates. Restricting to losses only would miss "why did I suddenly make triple my usual profit" days, which are just as worth explaining. `variance.ts` is a distinct concern from day-simulation/Prisma persistence (pure statistics + rule-based text generation over data `gameService.ts` fetches and hands it), and keeping it separate makes both pieces directly unit-testable in isolation, the same reasoning already applied to `calculateDemand`/`costPerCup`/etc.
- **Trade-off / what I gave up:** `ROLLING_WINDOW_DAYS=7`, `MIN_DAYS_FOR_VARIANCE=3`, `VARIANCE_Z_THRESHOLD=1.5`, `PRICE_DEVIATION_THRESHOLD=0.15`, and `DEMAND_DEVIATION_THRESHOLD=0.25` are all arbitrary/tunable, same as the rest of `gameConfig.ts` — not statistically validated, just plausible-looking defaults. Verified live end-to-end: three baseline days at price $1.00 (profits $34.18/$40.45/$29.99, driven by real demand noise) followed by a deliberately anomalous day ($0.10 price, sunny vs. mostly-normal weather, sold out) produced `isVarianceDay: true`, `varianceZScore: -15.11`, and all four explanation bullets — visually confirmed in the browser that the amber ring renders on both the cash and profit dots independent of their existing loss/sold-out fill coloring, and the "Variance Days" panel only appears once a flagged day exists.
