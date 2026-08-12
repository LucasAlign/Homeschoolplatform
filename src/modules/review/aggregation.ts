// Module G — notification aggregation (pure logic, unit-tested).
// docs/mvp-specification.md §10. Rolls queued notifications for one cadence tier
// into a count-only digest: the Daily review queue and the Weekly trend digest.
// Counts and opaque source references only — never student content.

import type { DigestBucket, Notification, NotificationTier } from './types';

/**
 * Roll up the still-Queued notifications for one tier. Delivered notifications
 * are excluded so a digest never re-reports what an adult has already seen.
 */
export function aggregateForTier(
  notifications: Notification[],
  tier: NotificationTier,
): DigestBucket {
  const inTier = notifications.filter((n) => n.tier === tier && n.state === 'Queued');

  const byKind: Record<string, number> = {};
  const byStudent: Record<string, number> = {};
  const sourceRefs: string[] = [];

  for (const n of inTier) {
    byKind[n.kind] = (byKind[n.kind] ?? 0) + 1;
    byStudent[n.studentId] = (byStudent[n.studentId] ?? 0) + 1;
    sourceRefs.push(n.sourceRef);
  }

  return { tier, total: inTier.length, byKind, byStudent, sourceRefs };
}

/** The Daily review queue rollup (reviews, grades, questionable completion). */
export function buildDailyQueue(notifications: Notification[]): DigestBucket {
  return aggregateForTier(notifications, 'Daily');
}

/** The Weekly digest rollup (progress / trends). */
export function buildWeeklyDigest(notifications: Notification[]): DigestBucket {
  return aggregateForTier(notifications, 'Weekly');
}
