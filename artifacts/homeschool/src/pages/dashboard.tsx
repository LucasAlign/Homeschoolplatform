import { useGetDashboard } from "@workspace/api-client-react";
import { Link } from "wouter";

export default function DashboardPage() {
  const { data: dashboard, isLoading, error } = useGetDashboard();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <span className="label-caps">Loading...</span>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="p-6 border-b border-black">
        <div className="bg-black text-white p-4 label-caps">
          Failed to load dashboard.
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col animate-in fade-in duration-500">

      {/* ───────────────────── HEADER ───────────────────── */}
      <section className="relative border-b border-black">
        <div className="grid grid-cols-12">
          <div className="col-span-12 md:col-span-9 px-6 md:px-10 pt-14 md:pt-20 pb-12 md:pb-16 border-b md:border-b-0 md:border-r border-black">
            <h1
              className="uppercase font-bold leading-[0.98]"
              style={{
                letterSpacing: '0.10em',
                fontSize: 'clamp(2.4rem, 7.2vw, 7.5rem)',
                fontWeight: 800,
              }}
            >
              Measure
              <br />
              twice.
              <br />
              <span className="text-[#9C9C9C]">Learn once.</span>
            </h1>
          </div>
          <div className="col-span-12 md:col-span-3 flex flex-col">
            <div className="px-6 md:px-8 py-8 border-b border-black flex-1">
              <p className="text-[13px] leading-[1.7] text-black">
                Here is the overview of your curriculum planning.
                Short lessons. Exact drills. Structured learning.
              </p>
            </div>
            <div className="px-6 md:px-8 py-8 border-b border-black">
              <span className="label-caps block mb-4">Quick Actions</span>
              <Link
                href="/students/new"
                className="w-full bg-black text-white py-4 text-[11px] uppercase font-semibold flex items-center justify-center hover:bg-white hover:text-black hover:border-black border border-black transition-colors"
                style={{ letterSpacing: '0.2em' }}
              >
                Register Student
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────── SPECIFICATION ROW ───────────────────── */}
      <section className="border-b border-black">
        <div className="grid grid-cols-2">
          <div className="px-6 md:px-8 py-10 border-r border-black">
            <span className="num-tab font-bold leading-none block" style={{ fontSize: 'clamp(2.2rem, 4.5vw, 4rem)' }}>
              {dashboard.courseCount}
            </span>
            <span className="mt-4 block text-[10px] uppercase text-[#9C9C9C]" style={{ letterSpacing: '0.18em' }}>
              Total Courses
            </span>
          </div>
          <div className="px-6 md:px-8 py-10">
            <span className="num-tab font-bold leading-none block" style={{ fontSize: 'clamp(2.2rem, 4.5vw, 4rem)' }}>
              {dashboard.lessonCount}
            </span>
            <span className="mt-4 block text-[10px] uppercase text-[#9C9C9C]" style={{ letterSpacing: '0.18em' }}>
              Total Lessons
            </span>
          </div>
        </div>
      </section>

      {/* ───────────────────── RECENT COURSES ───────────────────── */}
      <section className="flex-1 flex flex-col">
        <div className="px-6 md:px-10 py-6 border-b border-black flex items-center justify-between bg-black text-white">
          <h3 className="uppercase font-bold" style={{ letterSpacing: '0.14em', fontSize: '13px' }}>
            Recently Updated
          </h3>
          <Link href="/courses" className="label-caps hover:underline">
            View All
          </Link>
        </div>

        {dashboard.recentCourses.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 border-b border-black">
            <span className="label-caps text-[#9C9C9C] mb-6">No courses yet</span>
            <Link
              href="/students/new"
              className="bg-black text-white px-8 py-4 text-[11px] uppercase font-semibold border border-black hover:bg-white hover:text-black transition-colors"
              style={{ letterSpacing: '0.2em' }}
            >
              Register First Student
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {dashboard.recentCourses.map((course, i) => (
              <Link
                key={course.id}
                href={`/courses/${course.id}`}
                className={`group px-6 md:px-8 pt-8 pb-12 border-b border-black hover:bg-black hover:text-white transition-colors duration-150 ${i % 3 !== 2 ? 'md:border-r' : ''}`}
              >
                <div className="flex justify-between items-start mb-10">
                  <span className={`label-caps ${course.published ? 'text-black group-hover:text-white' : 'text-[#9C9C9C]'}`}>
                    {course.published ? 'Published' : 'Draft'}
                  </span>
                  {course.gradeLevel && (
                    <span className="label-caps text-[#9C9C9C]">
                      {course.gradeLevel}
                    </span>
                  )}
                </div>
                <h4 className="uppercase font-bold line-clamp-1" style={{ letterSpacing: '0.10em', fontSize: '22px' }}>
                  {course.title}
                </h4>
                {course.subject && (
                  <p className="mt-4 text-[13px] leading-[1.7] text-black group-hover:text-white">
                    {course.subject}
                  </p>
                )}

                <div className="mt-8 pt-4 border-t border-black group-hover:border-[#9C9C9C] flex justify-between">
                  <span className="text-[9px] num-tab uppercase text-[#9C9C9C]" style={{ letterSpacing: '0.12em' }}>
                    {course.unitCount} UNITS
                  </span>
                  <span className="text-[9px] num-tab uppercase text-[#9C9C9C]" style={{ letterSpacing: '0.12em' }}>
                    {course.lessonCount} LESSONS
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
