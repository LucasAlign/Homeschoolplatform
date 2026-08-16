import { useListCourses } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useState } from "react";

export default function CoursesPage() {
  const { data: courses, isLoading, error } = useListCourses();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCourses = courses?.filter(c => 
    c.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.subject?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <span className="label-caps">Loading courses...</span>
      </div>
    );
  }

  if (error || !courses) {
    return (
      <div className="p-6 border-b border-black">
        <div className="bg-black text-white p-4 label-caps">
          Failed to load courses.
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col animate-in fade-in duration-500">
      <div className="px-6 md:px-10 py-6 border-b border-black flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="uppercase font-bold" style={{ letterSpacing: '0.10em', fontSize: '22px' }}>
            Course Ledger
          </h1>
          <span className="label-caps text-[#9C9C9C] mt-2 block">
            Manage your curriculum subjects and lesson plans.
          </span>
        </div>
        <div className="flex items-center gap-4">
          <input
            type="text"
            placeholder="SEARCH COURSES..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input w-full md:w-64 uppercase border-black text-[11px] placeholder:text-[#9C9C9C]"
            style={{ letterSpacing: '0.1em' }}
          />
          <Link 
            href="/courses/new" 
            className="whitespace-nowrap bg-black text-white px-6 py-[11px] text-[11px] uppercase font-semibold border border-black hover:bg-white hover:text-black transition-colors"
            style={{ letterSpacing: '0.1em' }}
          >
            Create
          </Link>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {filteredCourses.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-16 border-b border-black">
            <span className="label-caps text-[#9C9C9C] mb-6">
              {searchQuery ? "No courses match." : "The ledger is empty."}
            </span>
            {!searchQuery && (
              <Link 
                href="/courses/new" 
                className="bg-black text-white px-8 py-4 text-[11px] uppercase font-semibold border border-black hover:bg-white hover:text-black transition-colors"
                style={{ letterSpacing: '0.2em' }}
              >
                Create First Course
              </Link>
            )}
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="hidden md:grid grid-cols-12 px-6 py-3 border-b border-black bg-black text-white">
              <div className="col-span-5"><span className="label-caps text-white">Title</span></div>
              <div className="col-span-2"><span className="label-caps text-white">Grade</span></div>
              <div className="col-span-2"><span className="label-caps text-white">Subject</span></div>
              <div className="col-span-2"><span className="label-caps text-white text-right block">Stats</span></div>
              <div className="col-span-1"><span className="label-caps text-white text-right block">Status</span></div>
            </div>
            
            {filteredCourses.map((course, i) => (
              <Link 
                key={course.id} 
                href={`/courses/${course.id}`}
                className="grid grid-cols-1 md:grid-cols-12 px-6 py-5 border-b border-black hover:bg-black hover:text-white transition-colors duration-150 group items-center gap-4 md:gap-0"
              >
                <div className="col-span-5">
                  <h3 className="font-bold text-[15px] uppercase" style={{ letterSpacing: '0.05em' }}>
                    {course.title}
                  </h3>
                </div>
                <div className="col-span-2">
                  <span className="label-caps text-[#9C9C9C] group-hover:text-white/70">
                    {course.gradeLevel || '—'}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="label-caps text-[#9C9C9C] group-hover:text-white/70">
                    {course.subject || '—'}
                  </span>
                </div>
                <div className="col-span-2 md:text-right">
                  <span className="num-tab text-[10px] uppercase text-[#9C9C9C] group-hover:text-white/70" style={{ letterSpacing: '0.1em' }}>
                    {course.unitCount} U / {course.lessonCount} L
                  </span>
                </div>
                <div className="col-span-1 md:text-right">
                  <span className={`label-caps ${course.published ? 'text-black group-hover:text-white' : 'text-[#9C9C9C] group-hover:text-white/50'}`}>
                    {course.published ? 'PUB' : 'DRFT'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
