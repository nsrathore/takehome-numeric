import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "@/test/prisma-mock";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// Import AFTER the mock is registered.
const { createItem, listItems } = await import("./itemService");

describe("itemService", () => {
  it("lists items ordered by newest first", async () => {
    prismaMock.item.findMany.mockResolvedValue([
      { id: "1", name: "First", notes: null, createdAt: new Date(), updatedAt: new Date() },
    ]);

    const items = await listItems();

    expect(items).toHaveLength(1);
    expect(prismaMock.item.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
    });
  });

  it("rejects an empty name before hitting the database", async () => {
    await expect(createItem({ name: "" })).rejects.toThrow();
    expect(prismaMock.item.create).not.toHaveBeenCalled();
  });

  it("creates a valid item", async () => {
    prismaMock.item.create.mockResolvedValue({
      id: "2",
      name: "Valid",
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const item = await createItem({ name: "Valid" });

    expect(item.name).toBe("Valid");
    expect(prismaMock.item.create).toHaveBeenCalledWith({
      data: { name: "Valid" },
    });
  });
});
