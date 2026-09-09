# Take-home project context

4-hour timed take-home. Graders care about: product decisions, coding
abstractions, and end-to-end shipping — not just final output. Documentation,
prompts, and test setup are explicitly part of what's evaluated. Keep
`NOTES.md` and `PROMPTS.md` current as you go (skills below automate this).

## Stack

Next.js 14 (App Router) + TypeScript + Prisma (SQLite) + Tailwind + Vitest.

## Commands

```bash
npm run dev            # http://localhost:3000
npm test                # vitest run
npm run lint             # eslint
npm run typecheck        # tsc --noEmit
npm run db:push          # sync prisma/schema.prisma to the db
npm run db:studio        # browse the db
```

Run lint + typecheck + test before considering any feature done.

## Architecture

- `src/app/api/**/route.ts` — HTTP layer only. Parse input, call a service,
  translate errors to status codes. No business logic here.
- `src/services/*.ts` — business logic + Zod validation. Framework-agnostic,
  unit-tested directly (no HTTP mocking needed).
- `src/lib/prisma.ts` — Prisma client singleton, don't instantiate PrismaClient
  elsewhere.
- `prisma/schema.prisma` — data model.
- `src/app/**/page.tsx` — UI. Client components fetch from `/api/*` routes.

**The `Item` resource (`itemService.ts`, `api/items/*`, `app/items/page.tsx`,
`itemService.test.ts`) is the reference implementation of this whole pattern.**
Copy its shape for every new resource — see the `new-resource` skill.

## Conventions

- API success responses: `{ <resourceName>: ... }` or `{ <resourceName>s: [...] }`.
- API error responses: `{ error: ... }` with an appropriate status code (400
  for validation via `ZodError`, 404 not found, 500 unhandled).
- Validation lives in the service layer via Zod schemas, not in route handlers.
- Tests mock Prisma with `src/test/prisma-mock.ts` (`vitest-mock-extended`) —
  see `itemService.test.ts` for the pattern. Don't hit a real database in
  unit tests.

## Available skills

- `/new-resource` — scaffold a new CRUD resource end-to-end (model → service
  → routes → optional page → tests), following the `Item` pattern.
- `write-tests` (auto) — write tests matching this repo's conventions.
- `log-decision` / `log-prompt` (auto) — keep `NOTES.md` / `PROMPTS.md`
  current without being asked.
- `scope-session` (auto) — turn an open-ended prompt into a scoped MVP plan;
  most useful right when the real prompt arrives and during the design call.
- `/wrap-up` — end-of-session checklist before submitting.

## Confirmed scope

_Fill this in live during/after the 45-minute design session — don't leave
it blank once the real prompt arrives._

- **Problem statement:**
- **Core user flow(s):**
- **Explicit non-goals (out of scope):**
- **Data model notes:**
- **Definition of done for this session:**
