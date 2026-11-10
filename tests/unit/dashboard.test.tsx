import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const queues = vi.hoisted(() => ({ approvals: vi.fn(), grades: vi.fn(), plans: vi.fn() }));
vi.mock('../../src/app/approvals/data', () => ({ listPendingApprovals: queues.approvals }));
vi.mock('../../src/app/grades/data', () => ({ listPendingAssessments: queues.grades }));
vi.mock('../../src/app/plans/data', () => ({ listPendingProposals: queues.plans }));

async function render() {
  const { default: Home } = await import('../../src/app/page');
  return renderToStaticMarkup(await Home());
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('FIRESTORE_EMULATOR_HOST', '127.0.0.1:8080');
  for (const load of Object.values(queues)) load.mockReset().mockResolvedValue([]);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('parent dashboard queue states', () => {
  it('totals live queues and links to their review pages', async () => {
    queues.approvals.mockResolvedValue([{}, {}]);
    queues.grades.mockResolvedValue([{}]);
    queues.plans.mockResolvedValue([{}, {}]);
    const html = await render();
    expect(html).toContain('5 items waiting');
    for (const href of ['/approvals', '/grades', '/plans']) {
      expect(html).toContain(`href="${href}"`);
    }
  });
  it('only declares all reviewed when every queue loaded empty', async () => {
    expect(await render()).toContain('Everything is reviewed');
  });
  it('does not treat a failed queue as zero or all reviewed', async () => {
    queues.grades.mockRejectedValue(new Error('unauthorized'));
    const html = await render();
    expect(html).toContain('Some queues are unavailable');
    expect(html).toContain('—');
    expect(html).not.toContain('Everything is reviewed');
    expect(html).not.toContain('no household is connected');
  });
  it('skips backend calls when no emulator is configured', async () => {
    vi.stubEnv('FIRESTORE_EMULATOR_HOST', '');
    expect(await render()).toContain('Live review counts are unavailable');
    for (const load of Object.values(queues)) expect(load).not.toHaveBeenCalled();
  });
  it('caps a stalled queue without hiding successful queues', async () => {
    vi.useFakeTimers();
    queues.grades.mockReturnValue(new Promise(() => {}));
    const { default: Home } = await import('../../src/app/page');
    const pending = Home().then(renderToStaticMarkup);
    await vi.advanceTimersByTimeAsync(2501);
    expect(await pending).toContain('Some queues are unavailable');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('clears timeout handles after successful reads', async () => {
    vi.useFakeTimers();
    await render();
    expect(vi.getTimerCount()).toBe(0);
  });
});
