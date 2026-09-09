import { z } from "zod";
import { prisma } from "@/lib/prisma";

// EXAMPLE SERVICE — this is the pattern to copy for your real domain:
// 1. zod schema for input validation
// 2. plain async functions containing the business logic
// 3. the API route (or a server action) stays a thin wrapper around these
//
// Keeping logic here (not inline in route handlers) is what makes it
// testable without spinning up a server or mocking `fetch`.

export const CreateItemInput = z.object({
  name: z.string().trim().min(1, "name is required").max(200),
  notes: z.string().trim().max(2000).optional(),
});
export type CreateItemInput = z.infer<typeof CreateItemInput>;

export async function listItems() {
  return prisma.item.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getItem(id: string) {
  return prisma.item.findUnique({ where: { id } });
}

export async function createItem(input: CreateItemInput) {
  const data = CreateItemInput.parse(input);
  return prisma.item.create({ data });
}

export async function deleteItem(id: string) {
  return prisma.item.delete({ where: { id } });
}
