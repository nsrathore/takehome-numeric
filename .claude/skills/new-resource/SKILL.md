---
name: new-resource
description: Scaffold a new CRUD resource end-to-end in this take-home project -- Prisma model, service layer with Zod validation, API routes, optional UI page, and tests -- following the Item reference implementation already in the repo. Invoke this explicitly whenever adding a new entity/feature; don't run it automatically since it changes the schema.
argument-hint: "[EntityName] [field:type ...]"
disable-model-invocation: true
---

# Scaffold a new resource

Arguments: `$0` is the entity name (PascalCase, e.g. `Task`). `$ARGUMENTS[1:]`
are fields as `name:type` pairs (e.g. `title:string done:boolean`). If no
fields are given, ask what fields the entity needs before proceeding.

Follow the `Game` resource as the template for every step below. Read the
relevant existing file before writing the new one so naming/style match
exactly.

## Steps

1. **Prisma model** — In `prisma/schema.prisma`, add a model for `$0` with
   the requested fields plus `id`, `createdAt`, `updatedAt` following the
   same shape as `GameState`/`Day`/`Purchase`. Run `npm run db:push` to sync
   the schema.

2. **Service layer** — Create `src/services/<entity>Service.ts` modeled
   exactly on `src/services/gameService.ts`:
   - A Zod schema (`Create<Entity>Input`) validating the fields.
   - `list<Entity>s`, `get<Entity>`, `create<Entity>`, `delete<Entity>`
     (adjust verbs/functions to what the entity actually needs).

3. **API routes** — Create `src/app/api/<entities>/route.ts` (GET list, POST
   create) and `src/app/api/<entities>/[id]/route.ts` (GET one, DELETE),
   modeled on the equivalent `game` routes. Routes stay thin: parse, call
   the service, map errors to status codes.

4. **UI page (only if the task needs one)** — If this resource needs a UI,
   create `src/app/<entities>/page.tsx` modeled on `src/app/game/page.tsx`:
   fetch on mount, form to create, list with delete.

5. **Tests** — Create `src/services/<entity>Service.test.ts` modeled on
   `gameService.test.ts`: mock Prisma via `src/test/prisma-mock.ts`, register
   the mock with `vi.mock("@/lib/prisma", ...)`, import the service *after*
   the mock. Cover: validation rejection, and the happy path for each
   function you wrote.

6. **Verify** — Run `npm run lint && npm run typecheck && npm test`. Fix
   anything that fails before moving on.

7. **Log it** — If you made any non-obvious modeling or validation choice
   while scaffolding, use the `log-decision` skill to record it in
   `NOTES.md` now, not later.
