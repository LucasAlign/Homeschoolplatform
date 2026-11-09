import { useState } from "react";
import type {
  GradingDraftList,
  GradingDraftView,
} from "@workspace/api-client-react";
export function GradingDrafts({
  studentId,
  assignmentId,
  submissionId,
  onApply,
}: {
  studentId: string;
  assignmentId: string;
  submissionId: string;
  onApply: (draft: GradingDraftView) => void;
}) {
  const [data, setData] = useState<GradingDraftList | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const path = `/api/students/${studentId}/work/${assignmentId}/grading-drafts`;
  async function load(generate = false) {
    setBusy(true);
    setError("");
    try {
      if (generate) {
        const response = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submissionId }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
      }
      const response = await fetch(path);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="border-t pt-3"
      onToggle={(e) => {
        if (e.currentTarget.open && !data && !busy) void load();
      }}
    >
      <summary className="font-semibold cursor-pointer">
        Grading drafts (synthetic testing)
      </summary>
      <div className="space-y-3 mt-3">
        <p className="border border-amber-400 bg-amber-50 p-3">
          External AI is disabled. Test feedback is simulated, does not analyze
          images, and never assigns a final grade automatically.
        </p>
        {data && <p>{data.availability.reason}</p>}
        {error && <p role="alert">{error}</p>}
        <button
          className="border rounded px-4 py-2 disabled:opacity-40"
          disabled={busy}
          onClick={() => load(true)}
        >
          {busy ? "Working..." : "Generate synthetic grading draft"}
        </button>
        {data?.drafts.map((d) => (
          <section key={d.id} className="border rounded p-3 space-y-2">
            <h4 className="font-semibold">
              {d.status === "simulated"
                ? "SIMULATED TEST DRAFT"
                : d.status.toUpperCase()}{" "}
              · {new Date(d.createdAt).toLocaleString()}
            </h4>
            <p>{d.reason}</p>
            {d.submissionId !== submissionId && (
              <p>Earlier submission — cannot apply to the current attempt.</p>
            )}
            {d.feedback && <p className="whitespace-pre-wrap">{d.feedback}</p>}
            {d.score !== null && (
              <p>
                Simulated suggestion: {d.score}/100. Parent review required.
              </p>
            )}
            {d.grounding.map((g, i) => (
              <blockquote
                key={i}
                className="border-l-2 pl-3 whitespace-pre-wrap"
              >
                <p>Rubric / key: {g.rubricQuote}</p>
                <p>Typed evidence: {g.evidenceQuote}</p>
                <p>{g.explanation}</p>
              </blockquote>
            ))}
            {d.status === "simulated" && d.submissionId === submissionId && (
              <button
                className="border rounded px-4 py-2"
                onClick={() => onApply(d)}
              >
                Use test draft in parent review
              </button>
            )}
          </section>
        ))}
      </div>
    </details>
  );
}
