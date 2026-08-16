import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";
import { updateLesson, deleteLesson } from "@/app/actions";

export default async function LessonEditorPage({
  params,
}: PageProps<"/courses/[id]/lessons/[lessonId]">) {
  const { id, lessonId } = await params;
  const user = await getCurrentUser();
  const lesson = await db.lesson.findFirst({
    where: {
      id: lessonId,
      unit: { course: { id, ownerId: user.id } },
    },
    include: { unit: { include: { course: true } } },
  });
  if (!lesson) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href={`/courses/${id}`} className="text-sm text-blue-600 hover:underline">
          ← {lesson.unit.course.title}
        </Link>
        <p className="mt-2 text-xs uppercase tracking-wide text-neutral-400">
          {lesson.unit.title}
        </p>
      </div>

      <form action={updateLesson.bind(null, lesson.id, id)} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Lesson title</span>
          <input
            name="title"
            required
            defaultValue={lesson.title}
            className="input text-lg font-semibold"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Lesson content</span>
          <textarea
            name="content"
            rows={16}
            defaultValue={lesson.content}
            placeholder="Write the lesson here — explanations, instructions, activities, links…"
            className="input font-mono leading-relaxed"
          />
          <span className="mt-1 block text-xs text-neutral-400">
            Plain text / Markdown. Rich formatting arrives in a later phase.
          </span>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="published"
            defaultChecked={lesson.published}
            className="h-4 w-4"
          />
          Published (visible to students in Phase 3)
        </label>

        <div className="flex items-center justify-between">
          <div className="flex gap-3">
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Save lesson
            </button>
            <Link
              href={`/courses/${id}`}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Cancel
            </Link>
          </div>
        </div>
      </form>

      <form
        action={deleteLesson.bind(null, lesson.id, id)}
        className="border-t border-neutral-200 pt-4 dark:border-neutral-800"
      >
        <button className="text-sm text-red-600 hover:underline">
          Delete this lesson
        </button>
      </form>
    </div>
  );
}
