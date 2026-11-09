import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runGrading,
  syntheticProvider,
  gradingAvailability,
} from "../src/lib/grading";
const input = { rubric: "Answer key: Five", notes: " five ", imageCount: 0 };
test("synthetic provider is labeled, grounded and never evaluates images", async () => {
  const match = await runGrading(input, syntheticProvider);
  assert.equal(match.status, "simulated");
  assert.equal(match.score, 100);
  assert.equal(match.simulated, true);
  assert.match(match.feedback!, /not AI grading/);
  assert.equal(match.grounding[0].rubricQuote, input.rubric);
  assert.equal(match.grounding[0].evidenceQuote, input.notes);
  assert.equal(
    (await runGrading({ ...input, notes: "Six" }, syntheticProvider)).score,
    0,
  );
  const rubric = await runGrading(
    { ...input, rubric: "Explain your reasoning clearly." },
    syntheticProvider,
  );
  assert.equal(rubric.score, null);
  assert.match(rubric.feedback!, /No correctness assessment/);
  assert.equal(
    (
      await runGrading(
        { ...input, notes: "", imageCount: 1 },
        syntheticProvider,
      )
    ).status,
    "unavailable",
  );
  assert.equal(
    (await runGrading({ ...input, rubric: "" }, syntheticProvider)).status,
    "unavailable",
  );
});
test("disabled and production configurations never select a real provider", async () => {
  const previous = {
    node: process.env.NODE_ENV,
    provider: process.env.GRADING_PROVIDER,
    synthetic: process.env.SYNTHETIC_DATA_ONLY,
  };
  try {
    process.env.NODE_ENV = "production";
    process.env.GRADING_PROVIDER = "synthetic";
    process.env.SYNTHETIC_DATA_ONLY = "true";
    assert.equal(gradingAvailability().enabled, false);
    assert.equal((await runGrading(input)).status, "unavailable");
    process.env.NODE_ENV = "test";
    process.env.GRADING_PROVIDER = "external-provider";
    assert.equal(gradingAvailability().enabled, false);
    assert.equal((await runGrading(input)).score, null);
  } finally {
    for (const [key, value] of Object.entries({
      NODE_ENV: previous.node,
      GRADING_PROVIDER: previous.provider,
      SYNTHETIC_DATA_ONLY: previous.synthetic,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
test("injected test providers fail closed on invalid grounding, scores, exceptions and timeouts", async () => {
  const good = {
    feedback: "An injected test fixture",
    score: 70,
    grounding: [
      {
        rubricQuote: input.rubric,
        evidenceQuote: input.notes,
        explanation: "Fixture source references",
      },
    ],
  };
  const valid = await runGrading(input, {
    id: "fixture",
    kind: "synthetic",
    generate: async () => good,
  });
  assert.match(valid.feedback!, /^Synthetic test only:/);
  for (const output of [
    { ...good, score: 101 },
    { ...good, grounding: [] },
    {
      ...good,
      grounding: [{ ...good.grounding[0], evidenceQuote: "not in submission" }],
    },
  ])
    assert.equal(
      (
        await runGrading(input, {
          id: "invalid",
          kind: "synthetic",
          generate: async () => output,
        })
      ).status,
      "failed",
    );
  const thrown = await runGrading(input, {
    id: "throws",
    kind: "synthetic",
    generate: async () => {
      throw new Error("private provider error");
    },
  });
  assert.equal(thrown.status, "failed");
  assert.equal(thrown.reason.includes("private provider error"), false);
  let aborted = false;
  const timeout = await runGrading(
    input,
    {
      id: "timeout",
      kind: "synthetic",
      generate: async (_input, signal) =>
        new Promise((_, reject) =>
          signal.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("aborted"));
          }),
        ),
    },
    5,
  );
  assert.equal(timeout.status, "failed");
  assert.equal(aborted, true);
});
