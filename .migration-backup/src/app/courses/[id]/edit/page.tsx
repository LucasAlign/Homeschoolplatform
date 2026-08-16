import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";
import { updateCourse } from "@/app/actions";

export default async function EditCoursePage({
  params,
}: PageProps<"/courses/[id]/edit">) {
  const { id } = await params;
  const user = await getCurrentUser();
  const course = await db.course.findFirst({ where: { id, ownerId: user.id } });
  if (!course) notFound();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href={`/courses/${course.id}`} className="text-sm text-blue-600 hover:underline">
          ← {course.title}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Edit course</h1>
      </div>

      <form action={updateCourse.bind(null, course.id)} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Title</span>
          <input name="title" required defaultValue={course.title} className="input" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Subject</span>
          <input name="subject" defaultValue={course.subject ?? ""} className="input" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Grade level</span>
          <input
            name="gradeLevel"
            defaultValue={course.gradeLevel ?? ""}
            className="input"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Description</span>
          <textarea
            name="description"
            rows={3}
            defaultValue={course.description ?? ""}
            className="input"
          />
        </label>
        <div className="flex gap-3">
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Save changes
          </button>
          <Link
            href={`/courses/${course.id}`}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
