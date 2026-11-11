import type { ReactNode } from "react";
import { useGetDashboard } from "@workspace/api-client-react";
import { Link } from "wouter";
import {
  BookOpen,
  GraduationCap,
  NotebookPen,
  Plus,
  ArrowRight,
  Sparkles,
} from "lucide-react";

// Warm, friendly rework of the parent dashboard. Scoped to this page: it uses
// its own warm palette (amber / stone, rounded cards, soft shadows) via Tailwind
// utilities rather than the app's monochrome "Swiss atelier" tokens, so the rest
// of the app is unaffected until we decide to roll the warmth app-wide.

// Dev-only UI preview mode (VITE_PREVIEW_UI=1): render the dashboard with
// sample data so the design can be reviewed without a database or login.
// Never enabled in production.
const PREVIEW_UI = import.meta.env.VITE_PREVIEW_UI === "1";

const SAMPLE_DASHBOARD = {
  courseCount: 6,
  lessonCount: 48,
  recentCourses: [
    {
      id: "sample-1",
      title: "Exploring Life Science",
      subject: "Science",
      gradeLevel: "Grade 5",
      published: true,
      unitCount: 6,
      lessonCount: 24,
    },
    {
      id: "sample-2",
      title: "Story of the World: Ancients",
      subject: "History",
      gradeLevel: "Grade 4",
      published: true,
      unitCount: 4,
      lessonCount: 16,
    },
    {
      id: "sample-3",
      title: "Singapore Math 3B",
      subject: "Mathematics",
      gradeLevel: "Grade 3",
      published: false,
      unitCount: 5,
      lessonCount: 20,
    },
    {
      id: "sample-4",
      title: "Writing With Ease",
      subject: "Language Arts",
      gradeLevel: "Grade 2",
      published: true,
      unitCount: 3,
      lessonCount: 12,
    },
    {
      id: "sample-5",
      title: "Beginning Latin Roots",
      subject: "Latin",
      gradeLevel: "Grade 6",
      published: false,
      unitCount: 2,
      lessonCount: 8,
    },
    {
      id: "sample-6",
      title: "Nature Journaling & Art",
      subject: "Art",
      gradeLevel: "All ages",
      published: true,
      unitCount: 4,
      lessonCount: 10,
    },
  ],
};

export default function DashboardPage() {
  const query = useGetDashboard();
  const dashboard = PREVIEW_UI ? SAMPLE_DASHBOARD : query.data;
  const isLoading = PREVIEW_UI ? false : query.isLoading;
  const error = PREVIEW_UI ? null : query.error;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-16 bg-amber-50/40">
        <span className="flex items-center gap-2 text-stone-500">
          <Sparkles className="h-4 w-4 animate-pulse" />
          Loading your dashboard…
        </span>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="flex-1 bg-amber-50/40 p-6 md:p-10">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-rose-800">
          We couldn’t load your dashboard. Please try again in a moment.
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gradient-to-b from-amber-50/70 to-stone-50 animate-in fade-in duration-500">
      <div className="mx-auto w-full max-w-6xl px-6 md:px-10 py-10 md:py-14 space-y-10">
        {/* ── Greeting ── */}
        <section className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-amber-700">
              Your homeschool
            </p>
            <h1 className="mt-2 text-3xl md:text-4xl font-bold tracking-tight text-stone-900">
              Welcome back 👋
            </h1>
            <p className="mt-3 max-w-prose text-stone-600 leading-relaxed">
              Here’s an overview of your curriculum planning — short lessons,
              clear drills, structured learning, all in one place.
            </p>
          </div>
          <Link
            href="/students/new"
            className="group inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-amber-700 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
          >
            <Plus className="h-4 w-4" />
            Register student
          </Link>
        </section>

        {/* ── Stats ── */}
        <section className="grid gap-4 sm:grid-cols-2">
          <StatCard
            icon={<BookOpen className="h-5 w-5" />}
            label="Total courses"
            value={dashboard.courseCount}
            accent="amber"
          />
          <StatCard
            icon={<NotebookPen className="h-5 w-5" />}
            label="Total lessons"
            value={dashboard.lessonCount}
            accent="teal"
          />
        </section>

        {/* ── Recently updated ── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-900">
              Recently updated
            </h2>
            <Link
              href="/courses"
              className="group inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:text-amber-800"
            >
              View all
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          {dashboard.recentCourses.length === 0 ? (
            <EmptyCourses />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {dashboard.recentCourses.map((course) => (
                <Link
                  key={course.id}
                  href={`/courses/${course.id}`}
                  className="group flex flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
                >
                  <div className="flex items-center justify-between">
                    <StatusBadge published={course.published} />
                    {course.gradeLevel && (
                      <span className="text-xs font-medium text-stone-400">
                        {course.gradeLevel}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-4 font-semibold text-stone-900 line-clamp-1 group-hover:text-amber-800">
                    {course.title}
                  </h3>
                  {course.subject && (
                    <p className="mt-1 text-sm text-stone-500 line-clamp-2">
                      {course.subject}
                    </p>
                  )}
                  <div className="mt-5 flex items-center gap-4 border-t border-stone-100 pt-4 text-xs text-stone-500">
                    <span className="num-tab">{course.unitCount} units</span>
                    <span className="num-tab">{course.lessonCount} lessons</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const ACCENTS = {
  amber: "bg-amber-100 text-amber-700",
  teal: "bg-teal-100 text-teal-700",
} as const;

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  accent: keyof typeof ACCENTS;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div>
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${ACCENTS[accent]}`}
        >
          {icon}
        </span>
        <p className="mt-4 text-sm font-medium text-stone-500">{label}</p>
      </div>
      <span className="num-tab text-4xl font-bold text-stone-900">{value}</span>
    </div>
  );
}

function StatusBadge({ published }: { published: boolean }) {
  return published ? (
    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
      Published
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-500">
      Draft
    </span>
  );
}

function EmptyCourses() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
        <GraduationCap className="h-6 w-6" />
      </span>
      <p className="mt-4 font-semibold text-stone-900">No courses yet</p>
      <p className="mt-1 max-w-sm text-sm text-stone-500">
        Register your first student to start building a curriculum.
      </p>
      <Link
        href="/students/new"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-amber-700 hover:shadow-md"
      >
        <Plus className="h-4 w-4" />
        Register first student
      </Link>
    </div>
  );
}
