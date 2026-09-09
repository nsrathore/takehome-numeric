"use client";

import { useEffect, useState } from "react";

type Item = {
  id: string;
  name: string;
  notes: string | null;
  createdAt: string;
};

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/items");
    const data = await res.json();
    setItems(data.items);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, notes: notes || undefined }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(JSON.stringify(body.error));
      return;
    }
    setName("");
    setNotes("");
    await load();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/items/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Items</h1>
      <p className="mt-1 text-sm text-slate-500">
        Example CRUD slice — API route → service layer → Prisma → SQLite.
      </p>

      <form onSubmit={handleCreate} className="mt-6 flex flex-col gap-2">
        <input
          className="rounded-md border border-slate-300 px-3 py-2"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className="rounded-md border border-slate-300 px-3 py-2"
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <button
          type="submit"
          className="self-start rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-700"
        >
          Add item
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      <ul className="mt-8 divide-y divide-slate-200">
        {loading && <li className="py-3 text-slate-500">Loading…</li>}
        {!loading && items.length === 0 && (
          <li className="py-3 text-slate-500">No items yet.</li>
        )}
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium">{item.name}</p>
              {item.notes && (
                <p className="text-sm text-slate-500">{item.notes}</p>
              )}
            </div>
            <button
              onClick={() => handleDelete(item.id)}
              className="text-sm text-red-600 hover:underline"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
