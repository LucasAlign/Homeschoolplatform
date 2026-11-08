import { z } from "zod/v4";
const line = z.string().trim().min(1).max(200);
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(value + "T00:00:00Z");
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }, "Use a valid calendar date");
export const assignmentInput = z
  .object({
    title: line,
    subject: line,
    curriculum: line,
    sourceType: z.enum(["textbook", "offline", "website", "custom"]),
    instructions: z.string().trim().min(1).max(10000),
    resourceUrl: z
      .string()
      .max(2000)
      .url()
      .refine((v) => /^https?:\/\//.test(v))
      .nullable()
      .default(null),
    dueDate: dateOnly,
    schoolYear: line,
    rubric: z.string().trim().min(1).max(10000),
  })
  .strict();

// Small raster-only synthetic fixtures. No remote fetches, SVG, or public file paths.
export function isRasterDataUrl(value: string) {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
    value,
  );
  if (!match) return false;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 1024 * 1024 || bytes.toString("base64") !== match[2])
    return false;
  return match[1] === "png"
    ? bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
}
export const submissionInput = z
  .object({
    notes: z.string().trim().max(10000),
    evidence: z
      .array(
        z
          .object({
            name: line,
            dataUrl: z
              .string()
              .max(1400000)
              .refine(isRasterDataUrl, "Use PNG or JPEG up to 1 MB"),
          })
          .strict(),
      )
      .max(2),
  })
  .strict()
  .refine(
    (v) => v.notes.length > 0 || v.evidence.length > 0,
    "Add notes or an image",
  );
export const reviewInput = z
  .object({
    submissionId: line,
    decision: z.enum(["approved", "needs_revision"]),
    feedback: z.string().trim().min(1).max(10000),
    score: z.number().int().min(0).max(100).nullable().default(null),
  })
  .strict();
