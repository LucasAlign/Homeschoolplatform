// Module G — notification-tier routing (pure logic, unit-tested).
// docs/mvp-specification.md §10. Routes each event to exactly one cadence tier:
//   Immediate — security / urgent parent-defined events.
//   Daily     — reviews, grades, questionable completion (the daily queue).
//   Weekly    — progress / trends (the weekly digest).
// Routing never severs learning; a tier only decides WHEN an adult is told.

import type { NotificationEvent, NotificationTier } from './types';

/**
 * Decide the cadence tier for one event. Immediate wins for security events and
 * anything a parent-defined rule (or the event's own severity) marks urgent;
 * progress/trend rollups go to the Weekly digest; everything else — reviews,
 * grades, questionable completion — lands in the Daily queue.
 */
export function routeToTier(event: NotificationEvent): NotificationTier {
  if (event.kind === 'security_urgent') return 'Immediate';
  if (event.parentUrgent === true) return 'Immediate';
  if (event.severity === 'urgent') return 'Immediate';

  if (event.kind === 'progress_trend') return 'Weekly';

  // review_flag, grade_ready, questionable_completion → the daily review queue.
  return 'Daily';
}
