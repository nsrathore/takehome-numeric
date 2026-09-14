# [Project Name]

One or two sentences: what this does and who it's for.

## Setup

```bash
npm install
cp .env.example .env
npm run db:push      # creates the SQLite db from prisma/schema.prisma
npm run dev           # http://localhost:3000
```

## Running tests

```bash
npm test
```

## Architecture

- **`src/app`** — routes (pages + API routes), thin.
- **`src/services`** — business logic, framework-agnostic, unit-tested directly.
- **`src/lib`** — shared infra (Prisma client, etc).
- **`prisma/schema.prisma`** — data model.

Brief note on why this shape: [fill in during the take-home].

## Key decisions & trade-offs

See `NOTES.md` for the running log. Summarize the 2-3 most important ones here
for whoever reads this first.

## Assumptions

- [What you assumed when the spec was ambiguous, and why.]
- **Suggested price** (`GET /api/game/suggest-price`) assumes a static, known
  demand curve — it grid-searches the same `calculateDemand` formula/constants
  used for the actual simulation, treating them as ground truth for every
  candidate price. Like the demand model itself, this is intentionally not
  tuned or validated against anything real. It doesn't account for cross-day
  effects (reputation, repeat customers, a price change today shifting
  tomorrow's demand) — each day is priced as an independent, memoryless
  decision. A more realistic version would estimate the demand curve from
  the game's own observed sales history (e.g. a simple Bayesian or
  regression fit updated after each day) instead of assuming the fixed
  formula is correct.

## What's not done / what I'd do next

- [Be honest here — this is a positive signal, not a negative one.]
