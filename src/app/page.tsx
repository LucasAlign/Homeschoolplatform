// Parent dashboard (home). Replaces the old "under construction" placeholder
// with an at-a-glance view of what needs the parent's attention: curriculum
// approvals, grades to review, and schedule proposals — each a live count that
// links into its queue.
//
// Server component: it reads through the same authorized queue loaders the
// feature pages use. Those throw when there is no seeded dev household / the
// emulator isn't running, so each read is isolated and a queue
// that fails to load degrades to a "—" tile instead of taking down the page.

import Link from 'next/link';
import { listPendingApprovals } from './approvals/data';
import { listPendingAssessments } from './grades/data';
import { listPendingProposals } from './plans/data';

export const dynamic = 'force-dynamic'; // always reflect the live queues

/** A count that either loaded (number) or couldn't be read (null). */
type Count = number | null;

// The stat tiles read live queues through firebase-admin. Those reads only
// resolve against a configured backend (the local Firestore emulator in dev).
// With no emulator host set, the Admin SDK takes the production path and can
// block on credential discovery / an unreachable Firestore — which would spin
// the home page forever (e.g. in a preview with no emulator). So only attempt
// the reads when an emulator is configured, and still cap each one with a
// timeout so an unreachable backend degrades to a "—" tile instead of hanging.
const BACKEND_CONFIGURED = !!process.env.FIRESTORE_EMULATOR_HOST;
const READ_TIMEOUT_MS = 2500;

async function countOf<T>(load: () => Promise<T[]>): Promise<Count> {
  if (!BACKEND_CONFIGURED) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const rows = await Promise.race([
      load(),
      new Promise<never>((_, reject) =>
        { timer = setTimeout(() => reject(new Error('read timed out')), READ_TIMEOUT_MS); },
      ),
    ]);
    return rows.length;
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export default async function Home() {
  const [approvals, grades, plans] = await Promise.all([
    countOf(listPendingApprovals),
    countOf(listPendingAssessments),
    countOf(listPendingProposals),
  ]);

  const anyLoaded = [approvals, grades, plans].some((c) => c !== null);
  const allLoaded = [approvals, grades, plans].every((c) => c !== null);
  const totalWaiting = [approvals, grades, plans].reduce<number>(
    (n, c) => n + (c ?? 0),
    0,
  );

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
          Lucas Align Homeschool
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Welcome back 👋
        </h1>
        <p className="mt-2 max-w-prose text-stone-600 dark:text-stone-300">
          {allLoaded
            ? totalWaiting > 0
              ? `You have ${totalWaiting} item${totalWaiting === 1 ? '' : 's'} waiting for your review across your queues.`
              : 'Everything is reviewed — nothing is waiting on you right now.'
            : anyLoaded
              ? `Loaded queues contain ${totalWaiting} item${totalWaiting === 1 ? '' : 's'} waiting for review. Some queues are unavailable.`
              : 'Live review counts are unavailable right now.'}
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          href="/approvals"
          emoji="📚"
          label="Curriculum approvals"
          count={approvals}
          hint="Extracted drafts awaiting your gate"
          accent="amber"
        />
        <StatCard
          href="/grades"
          emoji="✅"
          label="Grades to review"
          count={grades}
          hint="AI assessments ready for approval"
          accent="rose"
        />
        <StatCard
          href="/plans"
          emoji="🗓️"
          label="Schedule proposals"
          count={plans}
          hint="Proposed plans awaiting approval"
          accent="teal"
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
          Quick actions
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <ActionCard
            href="/approvals"
            emoji="➕"
            title="Review curriculum"
            description="Review extracted curriculum drafts awaiting approval."
          />
          <ActionCard
            href="/grades"
            emoji="🗂️"
            title="Review grades"
            description="Review assessments awaiting your approval."
          />
        </div>
      </section>

      {!allLoaded ? (
        <p role="status" className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300">
          Some review counts could not be loaded. A dash means unavailable, not zero.
          Check the queue pages and your session or backend connection.
          {!BACKEND_CONFIGURED ? ' Local preview counts require a running, seeded Firestore emulator and FIRESTORE_EMULATOR_HOST in the app environment.' : null}
        </p>
      ) : null}
    </div>
  );
}

const ACCENTS = {
  amber: {
    ring: 'hover:border-amber-300 dark:hover:border-amber-700/70',
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  },
  rose: {
    ring: 'hover:border-rose-300 dark:hover:border-rose-700/70',
    chip: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
  },
  teal: {
    ring: 'hover:border-teal-300 dark:hover:border-teal-700/70',
    chip: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  },
} as const;

function StatCard({
  href,
  emoji,
  label,
  count,
  hint,
  accent,
}: {
  href: string;
  emoji: string;
  label: string;
  count: Count;
  hint: string;
  accent: keyof typeof ACCENTS;
}) {
  const a = ACCENTS[accent];
  return (
    <Link
      href={href}
      className={`group flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:border-stone-800 dark:bg-stone-900 ${a.ring}`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${a.chip}`}
          aria-hidden
        >
          {emoji}
        </span>
        <span className="text-3xl font-bold tabular-nums text-stone-900 dark:text-stone-100">
          {count ?? '—'}
        </span>
      </div>
      <div>
        <p className="font-semibold text-stone-900 dark:text-stone-100">{label}</p>
        <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">{hint}</p>
      </div>
    </Link>
  );
}

function ActionCard({
  href,
  emoji,
  title,
  description,
}: {
  href: string;
  emoji: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-4 transition hover:border-amber-300 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-amber-700/70"
    >
      <span className="text-xl" aria-hidden>
        {emoji}
      </span>
      <div>
        <p className="font-semibold text-stone-900 group-hover:text-amber-700 dark:text-stone-100 dark:group-hover:text-amber-400">
          {title}
        </p>
        <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
          {description}
        </p>
      </div>
    </Link>
  );
}
