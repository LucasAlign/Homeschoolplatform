import Link from "next/link";
import { createCourse } from "@/app/actions";

export default function NewCoursePage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/courses" className="text-sm text-blue-600 hover:underline">
          ← Courses
        </Link>
        <h1 className="mt-2 text-2xl font-bold">New course</h1>
      </div>

      <form action={createCourse} className="space-y-4">
        <Field label="Title" required>
          <input
            name="title"
            required
            placeholder="e.g. 5th Grade Math"
            className="input"
          />
        </Field>
        <Field label="Subject">
          <input name="subject" placeholder="e.g. Mathematics" className="input" />
        </Field>
        <Field label="Grade level">
          <input name="gradeLevel" placeholder="e.g. Grade 5" className="input" />
        </Field>
        <Field label="Description">
          <textarea
            name="description"
            rows={3}
            placeholder="What does this course cover?"
            className="input"
          />
        </Field>
        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Create course
          </button>
          <Link
            href="/courses"
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
