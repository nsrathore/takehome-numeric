---
name: write-tests
description: Write unit tests that match this project's existing testing conventions -- Vitest with a deep-mocked Prisma client for service-layer logic, or Testing Library/jsdom for components. Use whenever adding test coverage for new or existing code in this repo, even if not explicitly asked.
---

# Write tests matching this repo's conventions

## Service-layer logic (the common case)

Follow `src/services/gameService.test.ts` exactly:

1. Import `prismaMock` from `src/test/prisma-mock.ts`.
2. Register it *before* importing the service under test:
   ```ts
   vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
   const { yourFunction } = await import("./yourService");
   ```
   (The dynamic import after the mock is required — a static top-level
   import would resolve before the mock is registered.)
3. `mockReset(prismaMock)` runs automatically before each test via the
   `beforeEach` already in `prisma-mock.ts` — don't add your own.
4. Set return values with `prismaMock.<model>.<method>.mockResolvedValue(...)`.
5. Cover at minimum: one validation-rejection case (bad input never reaches
   Prisma), and one happy-path case per exported function.

## Components

Use `@testing-library/react` (already configured with jsdom in
`vitest.config.ts` and `src/test/setup.ts`). Render, query by role/text,
assert on the rendered output — don't test implementation details like
internal state.

## What NOT to do

- Don't hit a real database or a real `fetch` — everything routes through
  the Prisma mock.
- Don't duplicate `beforeEach(mockReset(...))` — it's global.
- Don't test the framework (Next.js routing, Prisma itself) — test your own
  logic.

Run `npm test` after writing tests, not just `npm run typecheck` — a test
that compiles but doesn't run proves nothing.
