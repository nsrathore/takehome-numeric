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

## What's not done / what I'd do next

- [Be honest here — this is a positive signal, not a negative one.]
