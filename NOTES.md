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
