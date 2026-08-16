import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";
import { PublishBadge } from "@/app/page";
import {
  createUnit,
  createLesson,
  deleteUnit,
  deleteCourse,
  toggleCoursePublished,
} from "@/app/actions";

export default async function CourseDetailPage({
  params,
}: PageProps<"/courses/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  const course = await db.course.findFirst({
    where: { id, ownerId: user.id },
    include: {
      units: {
        orderBy: { order: "asc" },
        include: { lessons: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!course) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Link href="/courses" className="text-sm text-blue-600 hover:underline">
          ← Courses
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{course.title}</h1>
              <PublishBadge published={course.published} />
            </div>
            <p className="mt-1 text-sm text-neutral-500">
              {[course.subject, course.gradeLevel].filter(Boolean).join(" · ")}
            </p>
            {course.description && (
              <p className="mt-2 max-w-2xl text-neutral-600 dark:text-neutral-300">
                {course.description}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/courses/${course.id}/edit`}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Edit
            </Link>
            <form
              action={toggleCoursePublished.bind(null, course.id, !course.published)}
            >
              <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
                {course.published ? "Unpublish" : "Publish"}
              </button>
            </form>
            <form action={deleteCourse.bind(null, course.id)}>
              <button className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/40">
                Delete
              </button>
            </form>
          </div>
        </div>
      </div>

      <section className="space-y-4">
        {course.units.length === 0 && (
          <p className="text-sm text-neutral-500">
            No units yet. Add your first unit below to start building lessons.
          </p>
        )}

        {course.units.map((unit, i) => (
          <div
            key={unit.id}
            className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">
                <span className="text-neutral-400">Unit {i + 1} · </span>
                {unit.title}
              </h3>
              <form action={deleteUnit.bind(null, unit.id, course.id)}>
                <button className="text-xs text-neutral-400 hover:text-red-600">
                  Remove unit
                </button>
              </form>
            </div>

            <ul className="mt-3 divide-y divide-neutral-100 dark:divide-neutral-800">
              {unit.lessons.map((lesson) => (
                <li key={lesson.id} className="flex items-center justify-between py-2">
                  <Link
                    href={`/courses/${course.id}/lessons/${lesson.id}`}
                    className="text-sm hover:text-blue-600"
                  >
                    {lesson.title}
                  </Link>
                  <PublishBadge published={lesson.published} />
                </li>
              ))}
              {unit.lessons.length === 0 && (
                <li className="py-2 text-sm text-neutral-400">No lessons yet.</li>
              )}
            </ul>

            <form
              action={createLesson.bind(null, unit.id, course.id)}
              className="mt-3 flex gap-2"
            >
              <input
                name="title"
                required
                placeholder="New lesson title…"
                className="input"
              />
              <button className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
                Add lesson
              </button>
            </form>
          </div>
        ))}

        <form
          action={createUnit.bind(null, course.id)}
          className="flex gap-2 rounded-xl border border-dashed border-neutral-300 p-4 dark:border-neutral-700"
        >
          <input
            name="title"
            required
            placeholder="New unit title (e.g. Fractions)…"
            className="input"
          />
          <button className="shrink-0 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
            Add unit
          </button>
        </form>
      </section>
    </div>
  );
}
