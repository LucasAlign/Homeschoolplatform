import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import type {
  ChildWork as Work,
  WorkAssignmentWithHistory as Assignment,
} from "@workspace/api-client-react";

type Student = { id: string; firstName: string; preferredName: string | null };
const field = "block w-full border border-gray-400 rounded p-2 mt-1 bg-white";
const button =
  "border border-black rounded px-4 py-2 disabled:opacity-40 hover:bg-gray-100";
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    `/api${path}`,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Request failed. Please retry.");
  return data;
}

export default function WorkPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState("");
  const [work, setWork] = useState<Work | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("due");
  const [year, setYear] = useState("");
  useEffect(() => {
    api<Student[]>("/students")
      .then((data) => {
        setStudents(data);
        setStudentId(data[0]?.id ?? "");
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    let active = true;
    setWork(null);
    setError("");
    if (studentId)
      api<Work>(`/students/${studentId}/work`)
        .then((data) => {
          if (active) setWork(data);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [studentId]);
  async function save(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, body);
      setWork(await api<Work>(`/students/${studentId}/work`));
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    if (
      await save(`/students/${studentId}/work`, {
        ...values,
        resourceUrl: values.resourceUrl || null,
      })
    )
      form.reset();
  }
  function exportPortfolio() {
    if (!work || !year) return;
    const selected = work.assignments.filter((a) => a.schoolYear === year);
    const file = new Blob(
      [
        JSON.stringify(
          {
            version: 1,
            exportedAt: new Date().toISOString(),
            schoolYear: year,
            student: work.student,
            assignments: selected,
            ai: work.ai,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `portfolio-${studentId}-${year.replace(/[^a-zA-Z0-9-]/g, "_")}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const shown =
    work?.assignments.filter(
      (a) =>
        filter === "all" ||
        (filter === "review"
          ? a.status === "submitted"
          : a.dueDate <= today() &&
            ["assigned", "needs_revision"].includes(a.status)),
    ) ?? [];
  return (
    <div className="p-6 md:p-10 space-y-6 max-w-6xl w-full mx-auto">
      <h1 className="text-3xl font-bold">Each child's learning day</h1>
      <p
        role="note"
        className="p-4 bg-amber-50 border border-amber-300 rounded"
      >
        Local synthetic-data workspace. Use fictional children and sample images
        only. Family sign-in and real student data are not enabled.
      </p>
      {error && (
        <p role="alert" className="p-4 border border-red-500 text-red-800">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-4">
        <label>
          Child
          <select
            aria-label="Child"
            className={field}
            value={studentId}
            disabled={busy}
            onChange={(e) => {
              setStudentId(e.target.value);
              setYear("");
            }}
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.preferredName || s.firstName}
              </option>
            ))}
          </select>
        </label>
        <Link className={button} href="/students/new">
          Add fictional learner
        </Link>
      </div>
      {!students.length && !error && <p>Add a fictional learner to begin.</p>}
      {studentId && !work && !error && (
        <p role="status">Loading assignments...</p>
      )}
      {work && (
        <>
          <details className="border rounded p-4">
            <summary className="font-semibold cursor-pointer">
              Plan an assignment
            </summary>
            <form onSubmit={create} className="grid md:grid-cols-2 gap-4 mt-4">
              {[
                ["title", "Assignment title"],
                ["subject", "Subject"],
                ["curriculum", "Curriculum or book"],
                ["schoolYear", "School year"],
              ].map(([name, label]) => (
                <label key={name}>
                  {label}
                  <input
                    name={name}
                    required
                    maxLength={200}
                    className={field}
                    placeholder={name === "schoolYear" ? "2026-27" : undefined}
                  />
                </label>
              ))}
              <label>
                Source
                <select aria-label="Source" name="sourceType" className={field}>
                  {["textbook", "offline", "website", "custom"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Due date
                <input
                  type="date"
                  name="dueDate"
                  defaultValue={today()}
                  required
                  className={field}
                />
              </label>
              <label className="md:col-span-2">
                Website link (optional)
                <input
                  type="url"
                  name="resourceUrl"
                  placeholder="https://"
                  maxLength={2000}
                  className={field}
                />
              </label>
              <label>
                Instructions / pages / activity
                <textarea
                  name="instructions"
                  required
                  maxLength={10000}
                  className={field}
                />
              </label>
              <label>
                Rubric or answer key for parent review
                <textarea
                  name="rubric"
                  required
                  maxLength={10000}
                  className={field}
                />
              </label>
              <button disabled={busy} className={button}>
                Save assignment
              </button>
            </form>
          </details>
          <p className="text-sm text-gray-600">
            AI grading unavailable: {work.ai.reason}
          </p>
          <div className="flex flex-wrap gap-4 items-end">
            <label>
              Show
              <select
                aria-label="Show"
                className={field}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="due">Due today and overdue</option>
                <option value="review">Awaiting parent review</option>
                <option value="all">All work and portfolio</option>
              </select>
            </label>
            <label>
              Portfolio school year
              <select
                aria-label="Portfolio school year"
                className={field}
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                <option value="">Choose year</option>
                {[...new Set(work.assignments.map((a) => a.schoolYear))]
                  .sort()
                  .map((y) => (
                    <option key={y}>{y}</option>
                  ))}
              </select>
            </label>
            <button
              className={button}
              disabled={!year || busy}
              onClick={exportPortfolio}
            >
              Download year portfolio
            </button>
          </div>
          <p className="text-sm">
            The portfolio includes every assignment, image, submission attempt,
            and parent review for the selected year, including unfinished work.
          </p>
          {!shown.length && (
            <p className="border rounded p-6">No assignments in this view.</p>
          )}
          {shown.map((a) => (
            <AssignmentCard
              key={a.id}
              assignment={a}
              studentId={studentId}
              busy={busy}
              save={save}
              setReadingBusy={setBusy}
            />
          ))}
        </>
      )}
    </div>
  );
}

function AssignmentCard({
  assignment: a,
  studentId,
  busy,
  save,
  setReadingBusy,
}: {
  assignment: Assignment;
  studentId: string;
  busy: boolean;
  save: (path: string, body: unknown) => Promise<boolean>;
  setReadingBusy: (value: boolean) => void;
}) {
  const [fileError, setFileError] = useState("");
  const [reading, setReading] = useState(false);
  const latest = a.submissions.at(-1);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setFileError("");
    setReading(true);
    setReadingBusy(true);
    try {
      const files = data
        .getAll("images")
        .filter((v): v is File => v instanceof File && v.size > 0);
      if (
        files.length > 2 ||
        files.some(
          (f) =>
            f.size > 1024 * 1024 ||
            !["image/png", "image/jpeg"].includes(f.type),
        )
      )
        throw new Error("Choose up to two PNG/JPEG images, at most 1 MB each.");
      const evidence = await Promise.all(
        files.map(
          (file) =>
            new Promise<{ name: string; dataUrl: string }>(
              (resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () =>
                  resolve({ name: file.name, dataUrl: String(reader.result) });
                reader.onerror = () =>
                  reject(new Error("Could not read image"));
                reader.readAsDataURL(file);
              },
            ),
        ),
      );
      if (
        await save(`/students/${studentId}/work/${a.id}/submissions`, {
          notes: data.get("notes"),
          evidence,
        })
      )
        form.reset();
    } catch (e) {
      setFileError((e as Error).message);
    } finally {
      setReading(false);
      setReadingBusy(false);
    }
  }
  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (
      await save(`/students/${studentId}/work/${a.id}/reviews`, {
        submissionId: latest?.id,
        decision: data.get("decision"),
        feedback: data.get("feedback"),
        score: data.get("score") === "" ? null : Number(data.get("score")),
      })
    )
      form.reset();
  }
  return (
    <article className="border rounded-lg p-5 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{a.title}</h2>
        <p>
          {a.subject} · {a.curriculum} · {a.sourceType}
        </p>
        <p className="text-sm">
          Due {a.dueDate} · {a.status.replaceAll("_", " ")}
          {a.dueDate < today() &&
          ["assigned", "needs_revision"].includes(a.status)
            ? " · Overdue"
            : ""}
        </p>
      </div>
      <p className="whitespace-pre-wrap">{a.instructions}</p>
      {a.resourceUrl && (
        <a
          className="underline"
          href={a.resourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open learning resource
        </a>
      )}
      <details>
        <summary>Rubric / answer key (parent workspace)</summary>
        <p className="whitespace-pre-wrap mt-2">{a.rubric}</p>
      </details>
      {a.submissions.map((s, i) => (
        <div key={s.id} className="border-t pt-3 space-y-2">
          <h3 className="font-semibold">
            Attempt {i + 1} · {new Date(s.createdAt).toLocaleString()}
          </h3>
          <p className="whitespace-pre-wrap">{s.notes}</p>
          <div className="flex flex-wrap gap-4">
            {s.evidence.map((e, j) => (
              <figure key={j}>
                <img
                  src={e.dataUrl}
                  alt={e.name}
                  className="max-h-60 max-w-full"
                />
                <figcaption className="text-sm">{e.name}</figcaption>
              </figure>
            ))}
          </div>
          {s.reviews.map((r) => (
            <p key={r.id} className="whitespace-pre-wrap bg-gray-50 p-3">
              Parent: {r.decision.replaceAll("_", " ")}
              {r.score !== null ? ` (${r.score}/100)` : ""} — {r.feedback}
            </p>
          ))}
        </div>
      ))}
      {["assigned", "needs_revision"].includes(a.status) && (
        <form onSubmit={submit} className="space-y-3 border-t pt-3">
          <h3 className="font-semibold">Submit completed work</h3>
          <label className="block">
            Notes
            <textarea name="notes" maxLength={10000} className={field} />
          </label>
          <label className="block">
            Sample photo or screenshot (PNG/JPEG, 1 MB each, up to two)
            <input
              className={field}
              name="images"
              type="file"
              accept="image/png,image/jpeg"
              multiple
            />
          </label>
          {fileError && <p role="alert">{fileError}</p>}
          <button className={button} disabled={busy || reading}>
            {reading ? "Reading images..." : "Submit for parent review"}
          </button>
        </form>
      )}
      {latest && (
        <details>
          <summary className="cursor-pointer font-semibold">
            Parent review / override
          </summary>
          <form onSubmit={review} className="space-y-3 mt-3">
            <label className="block">
              Decision
              <select aria-label="Decision" name="decision" className={field}>
                <option value="approved">Approve</option>
                <option value="needs_revision">Request revision</option>
              </select>
            </label>
            <label className="block">
              Feedback
              <textarea
                name="feedback"
                required
                maxLength={10000}
                className={field}
              />
            </label>
            <label className="block">
              Score (optional, 0–100)
              <input
                name="score"
                type="number"
                min={0}
                max={100}
                step={1}
                className={field}
              />
            </label>
            <button className={button} disabled={busy}>
              Save parent review
            </button>
          </form>
        </details>
      )}
    </article>
  );
}
