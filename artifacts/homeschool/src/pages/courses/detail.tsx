import { 
  useGetCourse, 
  useToggleCoursePublished, 
  useDeleteCourse,
  useCreateUnit,
  useDeleteUnit,
  useCreateLesson,
  useDeleteLesson,
  getGetCourseQueryKey,
  getListCoursesQueryKey,
  getGetDashboardQueryKey
} from "@workspace/api-client-react";
import { useParams, useLocation, Link } from "wouter";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export default function CourseDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  const { data: course, isLoading, error } = useGetCourse(id);
  
  const togglePublished = useToggleCoursePublished();
  const deleteCourse = useDeleteCourse();
  const createUnit = useCreateUnit();
  const deleteUnit = useDeleteUnit();
  const createLesson = useCreateLesson();
  const deleteLesson = useDeleteLesson();
  
  const [newUnitTitle, setNewUnitTitle] = useState("");
  const [isAddingUnit, setIsAddingUnit] = useState(false);
  
  const [addingLessonToUnit, setAddingLessonToUnit] = useState<string | null>(null);
  const [newLessonTitle, setNewLessonTitle] = useState("");

  if (isLoading) {
    return <div className="p-12 label-caps text-center">Loading course...</div>;
  }

  if (error || !course) {
    return <div className="p-12 label-caps text-center">Course not found.</div>;
  }

  const handleTogglePublished = () => {
    togglePublished.mutate(
      { id, data: { published: !course.published } },
      {
        onSuccess: (updatedData) => {
          queryClient.setQueryData(getGetCourseQueryKey(id), (old: any) => 
            old ? { ...old, published: updatedData.published } : old
          );
          queryClient.invalidateQueries({ queryKey: getListCoursesQueryKey() });
        }
      }
    );
  };

  const handleDeleteCourse = () => {
    if(!confirm("Are you sure you want to delete this course?")) return;
    deleteCourse.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCoursesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          setLocation("/courses");
        }
      }
    );
  };

  const handleCreateUnit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnitTitle.trim()) return;
    
    createUnit.mutate(
      { id, data: { title: newUnitTitle } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCourseQueryKey(id) });
          setNewUnitTitle("");
          setIsAddingUnit(false);
        }
      }
    );
  };

  const handleDeleteUnit = (unitId: string) => {
    if(!confirm("Delete this unit and all its lessons?")) return;
    deleteUnit.mutate(
      { unitId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCourseQueryKey(id) });
        }
      }
    );
  };

  const handleCreateLesson = (e: React.FormEvent, unitId: string) => {
    e.preventDefault();
    if (!newLessonTitle.trim()) return;
    
    createLesson.mutate(
      { unitId, data: { title: newLessonTitle } },
      {
        onSuccess: (lesson) => {
          queryClient.invalidateQueries({ queryKey: getGetCourseQueryKey(id) });
          setNewLessonTitle("");
          setAddingLessonToUnit(null);
          setLocation(`/courses/${id}/lessons/${lesson.id}`);
        }
      }
    );
  };

  const handleDeleteLesson = (lessonId: string) => {
    if(!confirm("Delete this lesson?")) return;
    deleteLesson.mutate(
      { lessonId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCourseQueryKey(id) });
        }
      }
    );
  };

  return (
    <div className="flex-1 flex flex-col animate-in fade-in duration-300">
      {/* ───────────────────── HEADER ───────────────────── */}
      <header className="border-b border-black">
        <div className="grid grid-cols-12 items-stretch">
          <div className="col-span-12 md:col-span-9 p-8 md:p-12 border-b md:border-b-0 md:border-r border-black">
            <div className="flex items-center gap-4 mb-6">
              <span className="label-caps">{course.subject || "NO SUBJECT"}</span>
              <span className="block w-1 h-1 bg-black" />
              <span className="label-caps">{course.gradeLevel || "NO GRADE"}</span>
            </div>
            
            <h1 className="uppercase font-bold leading-[0.95]" style={{ letterSpacing: '0.05em', fontSize: 'clamp(2rem, 5vw, 4rem)' }}>
              {course.title}
            </h1>
            
            {course.description && (
              <p className="mt-8 text-[14px] leading-[1.7] max-w-2xl">
                {course.description}
              </p>
            )}
          </div>
          
          <div className="col-span-12 md:col-span-3 flex flex-col">
            <div className="p-6 border-b border-black flex items-center justify-between">
              <span className="label-caps">Status</span>
              <span className={`label-caps ${course.published ? 'text-black' : 'text-[#9C9C9C]'}`}>
                {course.published ? 'Published' : 'Draft'}
              </span>
            </div>
            
            <div className="p-6 border-b border-black flex-1 flex flex-col gap-4 justify-center">
              <button
                onClick={handleTogglePublished}
                disabled={togglePublished.isPending}
                className="w-full bg-black text-white py-3 text-[10px] uppercase font-semibold border border-black hover:bg-white hover:text-black transition-colors"
                style={{ letterSpacing: '0.15em' }}
              >
                {course.published ? 'Revert to Draft' : 'Publish Course'}
              </button>
              
              <Link
                href={`/courses/${id}/edit`}
                className="w-full text-center bg-white text-black py-3 text-[10px] uppercase font-semibold border border-black hover:bg-black hover:text-white transition-colors"
                style={{ letterSpacing: '0.15em' }}
              >
                Edit Specification
              </Link>
              
              <button
                onClick={handleDeleteCourse}
                className="w-full text-left text-[10px] uppercase text-[#9C9C9C] hover:text-black transition-colors pt-2 border-t border-[#9C9C9C]/30"
                style={{ letterSpacing: '0.15em' }}
              >
                Destroy Course
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ───────────────────── STATS ───────────────────── */}
      <section className="border-b border-black">
        <div className="grid grid-cols-2">
          <div className="px-6 py-6 border-r border-black flex justify-between items-baseline">
            <span className="label-caps">Total Units</span>
            <span className="num-tab font-bold text-2xl">{course.units.length}</span>
          </div>
          <div className="px-6 py-6 flex justify-between items-baseline">
            <span className="label-caps">Total Lessons</span>
            <span className="num-tab font-bold text-2xl">{course.units.reduce((acc, unit) => acc + unit.lessons.length, 0)}</span>
          </div>
        </div>
      </section>

      {/* ───────────────────── CURRICULUM ───────────────────── */}
      <section className="flex-1">
        <div className="px-6 py-4 border-b border-black bg-black text-white">
          <h3 className="label-caps text-white">Curriculum Ledger</h3>
        </div>

        {course.units.length === 0 ? (
          <div className="p-12 border-b border-black flex flex-col items-center">
             <span className="label-caps text-[#9C9C9C] mb-6">No units constructed.</span>
             {!isAddingUnit && (
               <button 
                 onClick={() => setIsAddingUnit(true)}
                 className="bg-black text-white px-8 py-3 text-[11px] uppercase font-semibold border border-black hover:bg-white hover:text-black transition-colors"
               >
                 Add Unit
               </button>
             )}
          </div>
        ) : (
          <div className="divide-y divide-black border-b border-black">
            {course.units.map((unit, index) => (
              <div key={unit.id} className="grid grid-cols-1 md:grid-cols-12">
                
                {/* Unit Sidebar */}
                <div className="col-span-12 md:col-span-3 p-6 border-b md:border-b-0 md:border-r border-black bg-[#fafafa]">
                  <span className="label-caps text-[#9C9C9C] block mb-2">Unit {String(index + 1).padStart(2, '0')}</span>
                  <h4 className="font-bold uppercase text-[15px]" style={{ letterSpacing: '0.05em' }}>{unit.title}</h4>
                  
                  <button 
                    onClick={() => handleDeleteUnit(unit.id)}
                    className="mt-6 label-caps text-[#9C9C9C] hover:text-black"
                  >
                    Delete Unit
                  </button>
                </div>
                
                {/* Lessons List */}
                <div className="col-span-12 md:col-span-9 p-0">
                  {unit.lessons.length === 0 ? (
                    <div className="p-6 border-b border-black">
                      <span className="label-caps text-[#9C9C9C]">Empty</span>
                    </div>
                  ) : (
                    <div>
                      {unit.lessons.map((lesson, lIndex) => (
                        <div 
                          key={lesson.id} 
                          className="group flex items-center justify-between px-6 py-4 border-b border-black hover:bg-black hover:text-white transition-colors"
                        >
                          <div className="flex items-center gap-6">
                            <span className="num-tab text-[11px] w-6 text-[#9C9C9C] group-hover:text-white">
                              {String(lIndex + 1).padStart(2, '0')}
                            </span>
                            <span className="text-[13px] font-medium uppercase" style={{ letterSpacing: '0.05em' }}>
                              {lesson.title}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-6">
                            <span className={`label-caps ${lesson.published ? 'text-black group-hover:text-white' : 'text-[#9C9C9C] group-hover:text-white/50'}`}>
                              {lesson.published ? 'PUB' : 'DRFT'}
                            </span>
                            <div className="flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                               <Link href={`/courses/${id}/lessons/${lesson.id}`} className="label-caps text-white hover:underline">
                                 Edit
                               </Link>
                               <button onClick={() => handleDeleteLesson(lesson.id)} className="label-caps text-[#9C9C9C] hover:text-white">
                                 Del
                               </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {addingLessonToUnit === unit.id ? (
                    <form onSubmit={(e) => handleCreateLesson(e, unit.id)} className="flex items-stretch border-b border-black last:border-b-0">
                      <input
                        type="text"
                        autoFocus
                        placeholder="LESSON TITLE..."
                        value={newLessonTitle}
                        onChange={(e) => setNewLessonTitle(e.target.value)}
                        className="flex-1 px-6 py-4 outline-none uppercase text-[13px] font-medium placeholder:text-[#9C9C9C] border-r border-black bg-[#fafafa]"
                        style={{ letterSpacing: '0.05em' }}
                      />
                      <button type="button" onClick={() => {setAddingLessonToUnit(null); setNewLessonTitle("");}} className="px-6 py-4 label-caps bg-[#fafafa] border-r border-black hover:bg-black hover:text-white">
                        Cancel
                      </button>
                      <button type="submit" disabled={!newLessonTitle.trim()} className="px-6 py-4 label-caps bg-black text-white hover:bg-white hover:text-black transition-colors disabled:opacity-50 disabled:bg-black disabled:text-white">
                        Save
                      </button>
                    </form>
                  ) : (
                    <div className="border-b border-black last:border-b-0">
                      <button 
                        onClick={() => {setAddingLessonToUnit(unit.id); setNewLessonTitle("");}}
                        className="w-full text-left px-6 py-4 label-caps text-[#9C9C9C] hover:bg-black hover:text-white transition-colors"
                      >
                        + Add Lesson
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* ADD UNIT FORM */}
        <div className="border-b border-black">
          {isAddingUnit ? (
            <form onSubmit={handleCreateUnit} className="flex flex-col md:flex-row items-stretch">
              <div className="p-6 border-b md:border-b-0 md:border-r border-black w-full md:w-[25%] bg-[#fafafa]">
                 <span className="label-caps text-black">New Unit</span>
              </div>
              <div className="flex-1 flex flex-col md:flex-row">
                <input
                  type="text"
                  autoFocus
                  placeholder="UNIT TITLE..."
                  value={newUnitTitle}
                  onChange={(e) => setNewUnitTitle(e.target.value)}
                  className="flex-1 px-6 py-4 outline-none uppercase text-[13px] font-medium placeholder:text-[#9C9C9C] border-b md:border-b-0 md:border-r border-black"
                  style={{ letterSpacing: '0.05em' }}
                />
                <div className="flex">
                  <button type="button" onClick={() => {setIsAddingUnit(false); setNewUnitTitle("");}} className="flex-1 md:flex-none px-6 py-4 label-caps border-r border-black hover:bg-black hover:text-white">
                    Cancel
                  </button>
                  <button type="submit" disabled={!newUnitTitle.trim()} className="flex-1 md:flex-none px-8 py-4 label-caps bg-black text-white hover:bg-white hover:text-black hover:border-l hover:border-black transition-colors disabled:opacity-50">
                    Save Unit
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <button 
              onClick={() => setIsAddingUnit(true)}
              className="w-full text-left px-6 py-6 label-caps text-[#9C9C9C] hover:bg-black hover:text-white transition-colors"
            >
              + Add Another Unit
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
