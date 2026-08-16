"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/user";

function str(data: FormData, key: string): string {
  return (data.get(key) as string | null)?.trim() ?? "";
}

// ---- Courses ----

export async function createCourse(data: FormData) {
  const user = await getCurrentUser();
  const title = str(data, "title");
  if (!title) return;
  const course = await db.course.create({
    data: {
      title,
      description: str(data, "description") || null,
      subject: str(data, "subject") || null,
      gradeLevel: str(data, "gradeLevel") || null,
      ownerId: user.id,
    },
  });
  revalidatePath("/courses");
  redirect(`/courses/${course.id}`);
}

export async function updateCourse(courseId: string, data: FormData) {
  await db.course.update({
    where: { id: courseId },
    data: {
      title: str(data, "title"),
      description: str(data, "description") || null,
      subject: str(data, "subject") || null,
      gradeLevel: str(data, "gradeLevel") || null,
    },
  });
  revalidatePath(`/courses/${courseId}`);
  redirect(`/courses/${courseId}`);
}

export async function toggleCoursePublished(courseId: string, published: boolean) {
  await db.course.update({ where: { id: courseId }, data: { published } });
  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/courses");
}

export async function deleteCourse(courseId: string) {
  await db.course.delete({ where: { id: courseId } });
  revalidatePath("/courses");
  redirect("/courses");
}

// ---- Units ----

export async function createUnit(courseId: string, data: FormData) {
  const title = str(data, "title");
  if (!title) return;
  const count = await db.unit.count({ where: { courseId } });
  await db.unit.create({ data: { title, courseId, order: count } });
  revalidatePath(`/courses/${courseId}`);
}

export async function deleteUnit(unitId: string, courseId: string) {
  await db.unit.delete({ where: { id: unitId } });
  revalidatePath(`/courses/${courseId}`);
}

// ---- Lessons ----

export async function createLesson(unitId: string, courseId: string, data: FormData) {
  const title = str(data, "title");
  if (!title) return;
  const count = await db.lesson.count({ where: { unitId } });
  const lesson = await db.lesson.create({
    data: { title, unitId, order: count },
  });
  revalidatePath(`/courses/${courseId}`);
  redirect(`/courses/${courseId}/lessons/${lesson.id}`);
}

export async function updateLesson(lessonId: string, courseId: string, data: FormData) {
  await db.lesson.update({
    where: { id: lessonId },
    data: {
      title: str(data, "title"),
      content: (data.get("content") as string | null) ?? "",
      published: data.get("published") === "on",
    },
  });
  revalidatePath(`/courses/${courseId}`);
  redirect(`/courses/${courseId}`);
}

export async function deleteLesson(lessonId: string, courseId: string) {
  await db.lesson.delete({ where: { id: lessonId } });
  revalidatePath(`/courses/${courseId}`);
  redirect(`/courses/${courseId}`);
}
