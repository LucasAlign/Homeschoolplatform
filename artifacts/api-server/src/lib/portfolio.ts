import { z } from "zod/v4";
export const portfolioInput = z
  .object({
    schoolYear: z.string().trim().min(1).max(200),
    assignmentIds: z
      .array(z.string().min(1).max(200))
      .min(1)
      .max(30)
      .refine((ids) => new Set(ids).size === ids.length),
    includeEvidence: z.boolean().default(true),
    includeFeedback: z.boolean().default(true),
    includeHistory: z.boolean().default(false),
  })
  .strict();
type AssignmentRecord = {
  id: string;
  title: string;
  subject: string;
  curriculum: string;
  sourceType: string;
  instructions: string;
  dueDate: string;
  schoolYear: string;
  status: string;
  submissions: Array<{
    id: string;
    notes: string;
    createdAt: Date;
    evidence: Array<
      { name: string; url: string } | { name: string; dataUrl: string }
    >;
    reviews: Array<{
      decision: string;
      feedback: string;
      score: number | null;
      createdAt: Date;
      gradingDraftId: string | null;
      draftAction: string | null;
    }>;
  }>;
};
export function printablePortfolio(
  student: {
    firstName: string;
    preferredName: string | null;
    gradeLevel: string;
  },
  assignments: AssignmentRecord[],
  options: z.infer<typeof portfolioInput>,
) {
  return {
    title: "Learning portfolio",
    schoolYear: options.schoolYear,
    createdAt: new Date().toISOString(),
    learner: {
      name: student.preferredName || student.firstName,
      gradeLevel: student.gradeLevel,
    },
    notice:
      "Parent-selected learning record. Local synthetic data only. Not a certified transcript or a legal compliance determination.",
    options,
    summary: {
      selected: assignments.length,
      approved: assignments.filter((a) => a.status === "approved").length,
      awaitingReview: assignments.filter((a) => a.status === "submitted")
        .length,
      unfinished: assignments.filter((a) =>
        ["assigned", "needs_revision"].includes(a.status),
      ).length,
      subjects: [...new Set(assignments.map((a) => a.subject))].sort(),
    },
    work: assignments.map((a) => ({
      id: a.id,
      title: a.title,
      subject: a.subject,
      curriculum: a.curriculum,
      sourceType: a.sourceType,
      instructions: a.instructions,
      dueDate: a.dueDate,
      status: a.status,
      attempts: (options.includeHistory
        ? a.submissions
        : a.submissions.slice(-1)
      ).map((s) => ({
        submittedAt: s.createdAt,
        notes: s.notes,
        evidence: options.includeEvidence ? s.evidence : [],
        reviews: options.includeFeedback
          ? (options.includeHistory ? s.reviews : s.reviews.slice(-1)).map(
              (r) => ({
                decision: r.decision,
                feedback: r.feedback,
                score: r.score,
                reviewedAt: r.createdAt,
                provenance: r.gradingDraftId
                  ? `Parent ${r.draftAction} a synthetic test draft. Not real AI grading.`
                  : "Manual parent review",
              }),
            )
          : [],
      })),
    })),
  };
}
