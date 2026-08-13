// Placeholder landing page. The legacy Prisma/SQLite dashboard was retired when
// the Firebase data layer landed; the real UI (import/approval, age-adapted
// student experience, dashboards) is built in later phases — see
// docs/launch-readiness.md §B.5.

export default function Home() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Lucas Align Homeschool</h1>
        <p className="mt-1 text-neutral-500">
          Parent-directed homeschool coordination. Backend scaffolding is in
          place; the product UI is under construction.
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-neutral-300 p-6 text-sm text-neutral-500 dark:border-neutral-700">
        <p className="font-medium text-neutral-700 dark:text-neutral-300">
          Domain modules 0–8 are scaffolded and unit-tested.
        </p>
        <p className="mt-2">
          See{" "}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
            docs/mvp-specification.md
          </code>{" "}
          for the specification and{" "}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
            docs/launch-readiness.md
          </code>{" "}
          for what remains before a pilot.
        </p>
      </div>
    </div>
  );
}
