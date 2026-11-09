import { useState } from "react";
import type {
  PrintPortfolio,
  WorkAssignmentWithHistory,
} from "@workspace/api-client-react";
import "./portfolio.css";
export function PortfolioBuilder({
  studentId,
  assignments,
  onPreview,
}: {
  studentId: string;
  assignments: WorkAssignmentWithHistory[];
  onPreview: (report: PrintPortfolio) => void;
}) {
  const [year, setYear] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function preview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(
        `/api/students/${studentId}/work/portfolio/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schoolYear: year,
            assignmentIds: selected,
            includeEvidence: form.has("evidence"),
            includeFeedback: form.has("feedback"),
            includeHistory: form.has("history"),
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      onPreview(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="border rounded p-4">
      <summary className="font-semibold cursor-pointer">
        Build printable year portfolio
      </summary>
      <form onSubmit={preview} className="space-y-4 mt-4">
        <p>
          Select up to 30 assignments. The printable record excludes answer
          keys, private profile notes and unreviewed grading drafts.
        </p>
        <label className="block">
          Print school year
          <select
            aria-label="Print school year"
            value={year}
            required
            onChange={(e) => {
              setYear(e.target.value);
              setSelected([]);
            }}
            className="block border rounded p-2"
          >
            <option value="">Choose year</option>
            {[...new Set(assignments.map((a) => a.schoolYear))]
              .sort()
              .map((y) => (
                <option key={y}>{y}</option>
              ))}
          </select>
        </label>
        <div className="space-y-2">
          {assignments
            .filter((a) => a.schoolYear === year)
            .map((a) => (
              <label key={a.id} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={selected.includes(a.id)}
                  disabled={!selected.includes(a.id) && selected.length >= 30}
                  onChange={(e) =>
                    setSelected((ids) =>
                      e.target.checked
                        ? [...ids, a.id]
                        : ids.filter((id) => id !== a.id),
                    )
                  }
                />
                <span>
                  {a.title} — {a.subject}, {a.dueDate} (
                  {a.status.replaceAll("_", " ")})
                </span>
              </label>
            ))}
        </div>
        <fieldset className="space-y-2">
          <legend>Include in print</legend>
          <label className="block">
            <input type="checkbox" name="evidence" defaultChecked /> Photos and
            screenshots
          </label>
          <label className="block">
            <input type="checkbox" name="feedback" defaultChecked /> Parent
            feedback and scores
          </label>
          <label className="block">
            <input type="checkbox" name="history" /> All attempts and review
            history (otherwise latest only)
          </label>
        </fieldset>
        <p>
          {selected.length} selected. Parent-reviewed synthetic drafts remain
          labeled as simulated in the record.
        </p>
        {error && <p role="alert">{error}</p>}
        <button
          className="border rounded px-4 py-2 disabled:opacity-40"
          disabled={busy || !selected.length}
        >
          {busy ? "Preparing..." : "Preview selected portfolio"}
        </button>
      </form>
    </details>
  );
}
export function PortfolioPreview({
  report,
  onClose,
}: {
  report: PrintPortfolio;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [printing, setPrinting] = useState(false);
  async function print() {
    setPrinting(true);
    setError("");
    try {
      await Promise.all(
        [
          ...document.querySelectorAll<HTMLImageElement>(
            ".portfolio-sheet img",
          ),
        ].map((image) => image.decode()),
      );
      await document.fonts.ready;
      window.print();
    } catch {
      setError(
        "An image could not be loaded. Return to the portfolio builder and omit images or try again.",
      );
    } finally {
      setPrinting(false);
    }
  }
  return (
    <div className="portfolio-container">
      <div className="print-controls flex flex-wrap gap-4 p-5 border-b">
        <button className="border rounded px-4 py-2" onClick={onClose}>
          Back to work
        </button>
        <button
          className="border rounded px-4 py-2"
          onClick={print}
          disabled={printing}
        >
          {printing ? "Preparing images..." : "Print / Save as PDF"}
        </button>
        <p>
          Review this selection, then use your browser's Print or Save as PDF
          option. Turn off browser headers/footers for a clean record.
        </p>
        {error && <p role="alert">{error}</p>}
      </div>
      <main className="portfolio-sheet">
        <section className="portfolio-cover">
          <p className="portfolio-kicker">Parent-selected learning record</p>
          <h1>{report.title}</h1>
          <h2>
            {report.learner.name} · {report.schoolYear}
          </h2>
          <p>Grade level: {report.learner.gradeLevel}</p>
          <p>Prepared {new Date(report.createdAt).toLocaleDateString()}</p>
          <p>{report.notice}</p>
          <dl className="portfolio-totals">
            <div>
              <dt>Selected work</dt>
              <dd>{report.summary.selected}</dd>
            </div>
            <div>
              <dt>Approved</dt>
              <dd>{report.summary.approved}</dd>
            </div>
            <div>
              <dt>Awaiting review</dt>
              <dd>{report.summary.awaitingReview}</dd>
            </div>
            <div>
              <dt>Unfinished</dt>
              <dd>{report.summary.unfinished}</dd>
            </div>
          </dl>
          <h3>Subjects represented</h3>
          <p>{report.summary.subjects.join(" · ")}</p>
          <h3>Contents</h3>
          <ol>
            {report.work.map((w) => (
              <li key={w.id}>
                {w.title} — {w.subject}, due {w.dueDate}
              </li>
            ))}
          </ol>
        </section>
        {report.work.map((work) => (
          <article className="portfolio-work" key={work.id}>
            <header>
              <p className="portfolio-kicker">
                {work.subject} · {work.curriculum} · {work.sourceType}
              </p>
              <h2>{work.title}</h2>
              <p>
                Due {work.dueDate} · {work.status.replaceAll("_", " ")}
              </p>
            </header>
            <h3>Learning activity</h3>
            <p className="portfolio-text">{work.instructions}</p>
            {!work.attempts.length && <p>No work submitted yet.</p>}
            {work.attempts.map((attempt, i) => (
              <section key={i} className="portfolio-attempt">
                <h3>
                  Submitted {new Date(attempt.submittedAt).toLocaleString()}
                </h3>
                <p className="portfolio-text">
                  {attempt.notes || "No typed notes."}
                </p>
                {attempt.evidence.map((e, j) => (
                  <figure key={j}>
                    <img src={e.dataUrl} alt={e.name} />
                    <figcaption>{e.name}</figcaption>
                  </figure>
                ))}
                {attempt.reviews.map((review, j) => (
                  <div className="portfolio-review" key={j}>
                    <h4>
                      Parent review: {review.decision.replaceAll("_", " ")}
                      {review.score !== null ? ` · ${review.score}/100` : ""}
                    </h4>
                    <p className="portfolio-text">{review.feedback}</p>
                    <p className="portfolio-provenance">
                      {review.provenance} ·{" "}
                      {new Date(review.reviewedAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </section>
            ))}
          </article>
        ))}
      </main>
    </div>
  );
}
