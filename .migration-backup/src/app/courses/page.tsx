import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";
import { PublishBadge } from "@/app/page";

export default async function CoursesPage() {
  const user = await getCurrentUser();
  const courses = await db.course.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { units: true } },
      units: { select: { _count: { select: { lessons: true } } } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Courses</h1>
        <Link
          href="/courses/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New course
        </Link>
      </div>

      {courses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-10 text-center dark:border-neutral-700">
          <p className="text-neutral-500">You haven&apos;t created any courses yet.</p>
          <Link
            href="/courses/new"
            className="mt-3 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Create your first course
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {courses.map((c) => {
            const lessons = c.units.reduce((n, u) => n + u._count.lessons, 0);
            return (
              <li key={c.id}>
                <Link
                  href={`/courses/${c.id}`}
                  className="block h-full rounded-xl border border-neutral-200 bg-white p-5 transition hover:border-blue-400 dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold">{c.title}</h2>
                    <PublishBadge published={c.published} />
                  </div>
                  {c.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-neutral-500">
                      {c.description}
                    </p>
                  )}
                  <div className="mt-3 flex gap-3 text-xs text-neutral-400">
                    {c.gradeLevel && <span>{c.gradeLevel}</span>}
                    <span>{c._count.units} units</span>
                    <span>{lessons} lessons</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
