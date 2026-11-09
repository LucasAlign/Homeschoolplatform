import { z } from "zod/v4";
import { digest } from "./passwords";
export type GradingInput = {
  rubric: string;
  notes: string;
  imageCount: number;
};
export interface TestGradingProvider {
  id: string;
  kind: "synthetic";
  generate(input: GradingInput, signal: AbortSignal): Promise<unknown>;
}
const outputSchema = z
  .object({
    feedback: z.string().trim().min(1).max(4000),
    score: z.number().int().min(0).max(100).nullable(),
    grounding: z
      .array(
        z
          .object({
            rubricQuote: z.string().min(1).max(1000),
            evidenceQuote: z.string().min(1).max(1000),
            explanation: z.string().min(1).max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();
export type GradingResult = {
  status: "simulated" | "unavailable" | "failed";
  simulated: true;
  provider: string | null;
  feedback: string | null;
  score: number | null;
  grounding: z.infer<typeof outputSchema>["grounding"];
  reason: string;
};
const unavailable = (reason: string): GradingResult => ({
  status: "unavailable",
  simulated: true,
  provider: null,
  feedback: null,
  score: null,
  grounding: [],
  reason,
});
const normalized = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();
export const syntheticProvider: TestGradingProvider = {
  id: "synthetic-exact-match-v1",
  kind: "synthetic",
  async generate(input) {
    const answer = /^Answer key:\s*(.{1,900})$/i.exec(input.rubric.trim())?.[1];
    const score = answer
      ? normalized(answer) === normalized(input.notes)
        ? 100
        : 0
      : null;
    return {
      score,
      feedback: answer
        ? `Synthetic test only: literal answer-key comparison ${score === 100 ? "matched" : "did not match"} the typed response. This is not AI grading and does not assess reasoning or images.`
        : "Synthetic test only: rubric and typed response excerpts are linked below. No correctness assessment or grade was produced. Parent evaluation is required.",
      grounding: [
        {
          rubricQuote: input.rubric.slice(0, 1000),
          evidenceQuote: input.notes.slice(0, 1000),
          explanation: answer
            ? "Literal normalized text comparison only; no semantic evaluation."
            : "Source excerpts only; not a judgment of quality.",
        },
      ],
    };
  },
};
export function gradingAvailability() {
  const enabled =
    process.env.GRADING_PROVIDER === "synthetic" &&
    process.env.SYNTHETIC_DATA_ONLY === "true" &&
    ["development", "test"].includes(process.env.NODE_ENV ?? "");
  return {
    enabled,
    reason: enabled
      ? "Synthetic test provider only. No real AI grading or image analysis."
      : "External AI is disabled. No provider and sharing consent have been configured.",
  };
}
export function gradingSourceHash(
  rubric: string,
  submission: { id: string; notes: string; evidence: unknown },
) {
  return digest(
    JSON.stringify({
      rubric,
      submissionId: submission.id,
      notes: submission.notes,
      evidence: submission.evidence,
    }),
  );
}
export async function runGrading(
  input: GradingInput,
  provider: TestGradingProvider | null = gradingAvailability().enabled
    ? syntheticProvider
    : null,
  timeoutMs = 5000,
): Promise<GradingResult> {
  if (!provider || provider.kind !== "synthetic")
    return unavailable(
      "External AI is disabled. Configure only the synthetic test provider for this development workflow.",
    );
  if (!input.rubric.trim())
    return unavailable("A rubric or answer key is required.");
  if (!input.notes.trim())
    return unavailable(
      "Image-only work cannot be evaluated by this test provider. No OCR or image analysis was performed; review it manually.",
    );
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raw = await Promise.race([
      provider.generate(input, controller.signal),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("timeout"));
        }, timeoutMs);
      }),
    ]);
    const parsed = outputSchema.safeParse(raw);
    if (
      !parsed.success ||
      parsed.data.grounding.some(
        (g) =>
          !input.rubric.includes(g.rubricQuote) ||
          !input.notes.includes(g.evidenceQuote),
      )
    )
      throw new Error("ungrounded");
    return {
      status: "simulated",
      simulated: true,
      provider: provider.id,
      ...parsed.data,
      feedback: parsed.data.feedback.startsWith("Synthetic test only:")
        ? parsed.data.feedback
        : `Synthetic test only: ${parsed.data.feedback}`,
      reason:
        "SIMULATED TEST OUTPUT — not real AI grading. Images were not analyzed. A parent must review and explicitly save any decision.",
    };
  } catch {
    return {
      status: "failed",
      simulated: true,
      provider: provider.id,
      feedback: null,
      score: null,
      grounding: [],
      reason:
        "The test provider failed, timed out, or returned invalid/ungrounded output. No grade was saved.",
    };
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
  }
}
