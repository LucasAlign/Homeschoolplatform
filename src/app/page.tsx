import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const [courseCount, lessonCount, courses] = await Promise.all([
    db.course.count({ where: { ownerId: user.id } }),
    db.lesson.count({ where: { unit: { course: { ownerId: user.id } } } }),
    db.course.findMany({
      where: { ownerId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 4,
      include: { _count: { select: { units: true } } },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {user.name.split(" ")[0]}</h1>
        <p className="mt-1 text-neutral-500">Your curriculum at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Courses" value={courseCount} />
        <Stat label="Lessons" value={lessonCount} />
        <Stat label="Students" value="—" hint="Coming in Phase 2" />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent courses</h2>
          <Link href="/courses" className="text-sm text-blue-600 hover:underline">
            View all →
          </Link>
        </div>
        {courses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
            <p className="text-neutral-500">No courses yet.</p>
            <Link
              href="/courses/new"
              className="mt-3 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Create your first course
            </Link>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {courses.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/courses/${c.id}`}
                  className="block rounded-xl border border-neutral-200 bg-white p-4 transition hover:border-blue-400 dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{c.title}</span>
                    <PublishBadge published={c.published} />
                  </div>
                  <p className="mt-1 text-sm text-neutral-500">
                    {c._count.units} unit{c._count.units === 1 ? "" : "s"}
                    {c.subject ? ` · ${c.subject}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-neutral-500">{label}</div>
      {hint && <div className="mt-1 text-xs text-neutral-400">{hint}</div>}
    </div>
  );
}

export function PublishBadge({ published }: { published: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        published
          ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
          : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
      }`}
    >
      {published ? "Published" : "Draft"}
    </span>
  );
}
