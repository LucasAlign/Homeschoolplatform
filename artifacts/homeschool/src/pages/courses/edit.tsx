import { useGetCourse, useUpdateCourse, getGetCourseQueryKey, getListCoursesQueryKey } from "@workspace/api-client-react";
import { useLocation, useParams } from "wouter";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";

export default function EditCoursePage() {
  const params = useParams();
  const id = params.id as string;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  const { data: course, isLoading, error } = useGetCourse(id);
  const updateCourse = useUpdateCourse();
  
  const [formData, setFormData] = useState({
    title: "",
    subject: "",
    gradeLevel: "",
    description: ""
  });
  
  const initialized = useRef(false);

  useEffect(() => {
    if (course && !initialized.current) {
      setFormData({
        title: course.title,
        subject: course.subject || "",
        gradeLevel: course.gradeLevel || "",
        description: course.description || ""
      });
      initialized.current = true;
    }
  }, [course]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    updateCourse.mutate(
      { 
        id,
        data: {
          title: formData.title,
          subject: formData.subject || null,
          gradeLevel: formData.gradeLevel || null,
          description: formData.description || null
        } 
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCourseQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListCoursesQueryKey() });
          setLocation(`/courses/${id}`);
        }
      }
    );
  };

  if (isLoading) {
    return <div className="p-12 label-caps text-center">Loading...</div>;
  }

  if (error || !course) {
    return <div className="p-12 label-caps text-center">Course not found.</div>;
  }

  return (
    <div className="flex-1 flex flex-col animate-in fade-in duration-300">
      <div className="px-6 md:px-10 py-6 border-b border-black flex items-center justify-between">
        <h1 className="uppercase font-bold" style={{ letterSpacing: '0.10em', fontSize: '22px' }}>
          Edit Specification
        </h1>
        <Link href={`/courses/${id}`} className="label-caps hover:underline">
          Cancel
        </Link>
      </div>

      <div className="grid grid-cols-12 flex-1">
        <div className="col-span-12 md:col-span-4 p-8 border-b md:border-b-0 md:border-r border-black flex flex-col gap-6">
          <div>
             <span className="label-caps block mb-2 text-black">Target</span>
             <p className="text-[13px] leading-[1.7] text-black font-medium uppercase" style={{letterSpacing: '0.05em'}}>
               {course.title}
             </p>
          </div>
          <div>
            <span className="label-caps block mb-2">Modification</span>
            <p className="text-[13px] leading-[1.7] text-[#9C9C9C]">
              Update the structural parameters of this course.
            </p>
          </div>
        </div>

        <div className="col-span-12 md:col-span-8 p-0">
          <form onSubmit={handleSubmit} className="flex flex-col h-full">
            <div className="p-8 space-y-8 flex-1">
              <div>
                <label htmlFor="title" className="label-caps block mb-3">
                  Course Title <span className="text-black">*</span>
                </label>
                <input
                  id="title"
                  required
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))}
                  className="w-full border-b border-black py-2 text-2xl font-bold uppercase outline-none placeholder:text-[#9C9C9C]/50"
                  style={{ letterSpacing: '0.05em' }}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <label htmlFor="subject" className="label-caps block mb-3">Subject</label>
                  <input
                    id="subject"
                    type="text"
                    value={formData.subject}
                    onChange={(e) => setFormData(p => ({ ...p, subject: e.target.value }))}
                    className="w-full border-b border-black py-2 text-[13px] uppercase outline-none placeholder:text-[#9C9C9C]/50 font-medium"
                    style={{ letterSpacing: '0.05em' }}
                  />
                </div>
                
                <div>
                  <label htmlFor="gradeLevel" className="label-caps block mb-3">Grade Level</label>
                  <input
                    id="gradeLevel"
                    type="text"
                    value={formData.gradeLevel}
                    onChange={(e) => setFormData(p => ({ ...p, gradeLevel: e.target.value }))}
                    className="w-full border-b border-black py-2 text-[13px] uppercase outline-none placeholder:text-[#9C9C9C]/50 font-medium"
                    style={{ letterSpacing: '0.05em' }}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="description" className="label-caps block mb-3">Syllabus Description</label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
                  className="w-full border border-black p-4 text-[13px] leading-[1.7] outline-none placeholder:text-[#9C9C9C]/50 min-h-[160px] resize-none"
                />
              </div>
            </div>

            <div className="border-t border-black">
              <button
                type="submit"
                disabled={updateCourse.isPending || !formData.title.trim()}
                className="w-full bg-black text-white py-6 text-[11px] uppercase font-semibold flex items-center justify-center hover:bg-white hover:text-black transition-colors disabled:opacity-50 disabled:hover:bg-black disabled:hover:text-white border-t border-black"
                style={{ letterSpacing: '0.2em' }}
              >
                {updateCourse.isPending ? "Updating..." : "Save Modifications"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
