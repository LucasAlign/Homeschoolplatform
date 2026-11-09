import { z } from "zod/v4";
import { assignmentInput, dateOnly } from "./work-validation";
export const scheduleInput = assignmentInput
  .omit({ dueDate: true })
  .extend({
    title: z.string().trim().min(1).max(180),
    startDate: dateOnly,
    count: z.number().int().min(1).max(60),
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .refine((v) => new Set(v).size === v.length),
    skipDates: z.array(dateOnly).max(100).default([]),
    requestId: z.string().uuid(),
  })
  .strict();
export function planSchedule(input: z.infer<typeof scheduleInput>) {
  const {
    startDate,
    count,
    weekdays,
    skipDates,
    requestId: _requestId,
    ...assignment
  } = input;
  const result: Array<typeof assignment & { dueDate: string }> = [];
  const date = new Date(startDate + "T00:00:00Z");
  for (
    let day = 0;
    day < 730 && result.length < count;
    day++, date.setUTCDate(date.getUTCDate() + 1)
  ) {
    if (date.getUTCFullYear() > 9999) break;
    const dueDate = date.toISOString().slice(0, 10);
    if (weekdays.includes(date.getUTCDay()) && !skipDates.includes(dueDate))
      result.push({
        ...assignment,
        title: `${assignment.title} · Lesson ${result.length + 1}`,
        dueDate,
      });
  }
  if (result.length !== count)
    throw new Error("The schedule cannot fit in the next two years.");
  return result;
}
