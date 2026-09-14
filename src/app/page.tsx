import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Lemonade Stand</h1>
      <p className="mt-2 text-slate-600">
        Next.js (App Router) + TypeScript + Prisma (SQLite) + Tailwind + Vitest.
      </p>
      <Link
        href="/game"
        className="mt-6 inline-block rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-700"
      >
        Start New Game
      </Link>
    </main>
  );
}
