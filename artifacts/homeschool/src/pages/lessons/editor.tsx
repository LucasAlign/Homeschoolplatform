import { useGetLesson, useUpdateLesson, getGetLessonQueryKey, getGetCourseQueryKey } from "@workspace/api-client-react";
import { useParams, useLocation, Link } from "wouter";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

export default function LessonEditorPage() {
  const params = useParams();
  const lessonId = params.lessonId as string;
  const courseId = params.id as string;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: lesson, isLoading, error } = useGetLesson(lessonId);
  const updateLesson = useUpdateLesson();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [published, setPublished] = useState(false);
  
  const initialized = useRef(false);

  useEffect(() => {
    if (lesson && !initialized.current) {
      setTitle(lesson.title);
      setContent(lesson.content || "");
      setPublished(lesson.published);
      initialized.current = true;
    }
  }, [lesson]);

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!title.trim()) return;

    updateLesson.mutate(
      { 
        lessonId,
        data: {
          title,
          content,
          published
        } 
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetLessonQueryKey(lessonId) });
          queryClient.invalidateQueries({ queryKey: getGetCourseQueryKey(courseId) });
          setLocation(`/courses/${courseId}`);
        }
      }
    );
  };

  if (isLoading) {
    return <div className="p-12 label-caps text-center">Loading editor...</div>;
  }

  if (error || !lesson) {
    return <div className="p-12 label-caps text-center">Failed to load lesson.</div>;
  }

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* ───────────────────── EDITOR HEADER ───────────────────── */}
      <header className="border-b border-black">
        <div className="grid grid-cols-12 items-stretch">
          <div className="col-span-12 md:col-span-8 flex items-center gap-6 px-6 py-4 border-b md:border-b-0 md:border-r border-black">
            <Link 
              href={`/courses/${courseId}`} 
              className="label-caps hover:underline"
            >
              Back
            </Link>
            <span className="block w-px h-4 bg-black" />
            <div className="flex items-center gap-2">
              <span className="label-caps text-[#9C9C9C] truncate max-w-[150px]">{lesson.courseTitle}</span>
              <span className="label-caps text-[#9C9C9C]">/</span>
              <span className="label-caps text-black truncate max-w-[150px]">{lesson.unitTitle}</span>
            </div>
          </div>
          
          <div className="col-span-12 md:col-span-4 flex items-stretch">
            <div className="flex-1 flex items-center justify-center px-6 border-r border-black">
              <label className="flex items-center gap-3 cursor-pointer group w-full justify-center">
                <input 
                  type="checkbox" 
                  checked={published}
                  onChange={(e) => setPublished(e.target.checked)}
                  className="sr-only"
                />
                <span className="block w-4 h-4 border border-black relative">
                  {published && <span className="absolute inset-0.5 bg-black" />}
                </span>
                <span className={`label-caps ${published ? 'text-black' : 'text-[#9C9C9C]'}`}>
                  {published ? 'Published' : 'Draft'}
                </span>
              </label>
            </div>
            
            <button
              onClick={handleSave}
              disabled={updateLesson.isPending || !title.trim()}
              className="flex-1 bg-black text-white px-6 py-4 label-caps hover:bg-white hover:text-black transition-colors disabled:opacity-50"
            >
              {updateLesson.isPending ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </header>

      {/* ───────────────────── EDITOR MAIN ───────────────────── */}
      <main className="flex-1 grid grid-cols-12 border-b border-black">
        
        {/* Title Input Column */}
        <div className="col-span-12 md:col-span-4 p-8 border-b md:border-b-0 md:border-r border-black bg-[#fafafa]">
           <span className="label-caps block mb-6 text-[#9C9C9C]">Lesson Title</span>
           <textarea
             value={title}
             onChange={(e) => setTitle(e.target.value)}
             placeholder="LESSON TITLE"
             className="w-full text-[28px] uppercase font-bold leading-none bg-transparent border-none outline-none resize-none"
             style={{ letterSpacing: '0.05em' }}
             rows={4}
           />
        </div>

        {/* Content Input Column */}
        <div className="col-span-12 md:col-span-8 p-0 flex flex-col">
          <div className="px-8 py-4 border-b border-black">
             <span className="label-caps text-[#9C9C9C]">Body Content</span>
          </div>
          <div className="flex-1 p-8">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Start writing the lesson content here..."
              className="w-full h-full min-h-[50vh] bg-transparent border-none outline-none resize-none font-mono text-[13px] leading-[1.8] placeholder:text-[#9C9C9C]/50"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
