import type { EvalResult, Trajectory } from '@reaatech/agent-eval-harness-types';
import { describe, expect, it, vi } from 'vitest';
import { SuiteRunner, createSuiteRunner } from './runner.js';
import type { ProgressUpdate } from './runner.js';

function makeTrajectory(id: string): Trajectory {
  return {
    trajectory_id: id,
    turns: [
      { turn_id: 1, role: 'user' as const, content: 'hello', timestamp: '2026-04-15T23:00:00Z' },
      { turn_id: 1, role: 'agent' as const, content: 'hi', timestamp: '2026-04-15T23:00:01Z' },
    ],
  };
}

function makeEvalResult(overrides: Record<string, unknown> = {}): EvalResult {
  return {
    trajectory_id: 'traj-1',
    overall_score: 0.85,
    metrics: {
      faithfulness: 0.9,
      relevance: 0.85,
      tool_correctness: 0.95,
      cost_score: 0.97,
      latency_score: 0.88,
    },
    cost: 0.03,
    ...overrides,
  };
}

describe('runner', () => {
  describe('SuiteRunner', () => {
    it('creates with default config', () => {
      const runner = new SuiteRunner();
      expect(runner).toBeDefined();
    });

    it('creates with custom config', () => {
      const runner = new SuiteRunner({ concurrency: 10, timeoutMs: 30000 });
      expect(runner).toBeDefined();
    });

    describe('run', () => {
      it('returns completed status for successful evaluations', async () => {
        const runner = new SuiteRunner();
        const trajectories = [makeTrajectory('t1'), makeTrajectory('t2')];
        const evaluator = vi.fn().mockResolvedValue(makeEvalResult());

        const result = await runner.run(trajectories, evaluator);

        expect(result.status).toBe('completed');
        expect(result.completedTrajectories).toBe(2);
        expect(result.failedTrajectories).toBe(0);
        expect(result.totalTrajectories).toBe(2);
      });

      it('returns a runId starting with eval-', async () => {
        const runner = new SuiteRunner();
        const result = await runner.run(
          [makeTrajectory('t1')],
          vi.fn().mockResolvedValue(makeEvalResult()),
        );
        expect(result.runId).toMatch(/^eval-/);
      });

      it('returns startedAt and endedAt timestamps', async () => {
        const runner = new SuiteRunner();
        const result = await runner.run(
          [makeTrajectory('t1')],
          vi.fn().mockResolvedValue(makeEvalResult()),
        );
        expect(result.startedAt).toBeDefined();
        expect(result.endedAt).toBeDefined();
      });

      it('tracks duration in milliseconds', async () => {
        const runner = new SuiteRunner();
        const result = await runner.run(
          [makeTrajectory('t1')],
          vi.fn().mockResolvedValue(makeEvalResult()),
        );
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      });

      it('returns partial status when some evaluations fail and continueOnError is true', async () => {
        const runner = new SuiteRunner({ continueOnError: true });
        const trajectories = [makeTrajectory('t1'), makeTrajectory('t2')];
        const evaluator = vi
          .fn()
          .mockResolvedValueOnce(makeEvalResult())
          .mockRejectedValueOnce(new Error('Evaluation failed'));

        const result = await runner.run(trajectories, evaluator);

        expect(result.status).toBe('partial');
        expect(result.completedTrajectories).toBe(1);
        expect(result.failedTrajectories).toBe(1);
      });

      it('returns failed status when all evaluations fail', async () => {
        const runner = new SuiteRunner({ continueOnError: true });
        const evaluator = vi.fn().mockRejectedValue(new Error('fail'));
        const trajectories = [makeTrajectory('t1')];

        const result = await runner.run(trajectories, evaluator);

        expect(result.status).toBe('failed');
        expect(result.failedTrajectories).toBe(1);
        expect(result.completedTrajectories).toBe(0);
      });

      it('throws when continueOnError is false and evaluation fails', async () => {
        const runner = new SuiteRunner({ continueOnError: false, concurrency: 1 });
        const evaluator = vi.fn().mockRejectedValue(new Error('fail'));

        await expect(
          runner.run([makeTrajectory('t1'), makeTrajectory('t2')], evaluator),
        ).rejects.toThrow('fail');
      });

      it('stores trajectory results with correct IDs', async () => {
        const runner = new SuiteRunner({ concurrency: 1 });
        const trajectories = [makeTrajectory('t1'), makeTrajectory('t2')];
        const evaluator = vi.fn().mockResolvedValue(makeEvalResult());

        const result = await runner.run(trajectories, evaluator);

        expect(result.trajectoryResults).toHaveLength(2);
        const ids = result.trajectoryResults.map((r) => r.trajectoryId);
        expect(ids).toContain('t1');
        expect(ids).toContain('t2');
      });

      it('stores error messages for failed trajectories', async () => {
        const runner = new SuiteRunner({ continueOnError: true, concurrency: 1 });
        const evaluator = vi.fn().mockRejectedValueOnce(new Error('bad trajectory'));

        const result = await runner.run([makeTrajectory('t1')], evaluator);

        expect(result.trajectoryResults[0]?.error).toBe('bad trajectory');
      });

      it('stores empty result for failed trajectories', async () => {
        const runner = new SuiteRunner({ continueOnError: true, concurrency: 1 });
        const evaluator = vi.fn().mockRejectedValue(new Error('fail'));

        const result = await runner.run([makeTrajectory('t1')], evaluator);

        expect(result.trajectoryResults[0]?.result.overall_score).toBe(0);
      });

      it('computes overall metrics from results', async () => {
        const runner = new SuiteRunner({ concurrency: 1 });
        const evaluator = vi.fn().mockResolvedValue(
          makeEvalResult({
            overall_score: 0.9,
            metrics: {
              faithfulness: 0.95,
              relevance: 0.85,
              tool_correctness: 0.9,
            },
            cost: 0.02,
          }),
        );

        const result = await runner.run([makeTrajectory('t1')], evaluator);

        expect(result.overallMetrics.overallScore).toBe(0.9);
        expect(result.overallMetrics.avgFaithfulness).toBe(0.95);
        expect(result.overallMetrics.avgRelevance).toBe(0.85);
      });

      it('handles empty trajectory list', async () => {
        const runner = new SuiteRunner();
        const result = await runner.run([], vi.fn());

        expect(result.totalTrajectories).toBe(0);
        expect(result.completedTrajectories).toBe(0);
        expect(result.status).toBe('completed');
      });

      it('calls progress callback', async () => {
        const progressFn = vi.fn();
        const runner = new SuiteRunner({ concurrency: 1 }, progressFn);
        const evaluator = vi.fn().mockResolvedValue(makeEvalResult());

        await runner.run([makeTrajectory('t1')], evaluator);

        expect(progressFn).toHaveBeenCalled();
        const lastCall = progressFn.mock.calls[
          progressFn.mock.calls.length - 1
        ]?.[0] as ProgressUpdate;
        expect(lastCall.total).toBe(1);
        expect(lastCall.status).toBe('completed');
      });

      it('returns zero metrics when all results are errors', async () => {
        const runner = new SuiteRunner({ continueOnError: true, concurrency: 1 });
        const evaluator = vi.fn().mockRejectedValue(new Error('fail'));

        const result = await runner.run([makeTrajectory('t1')], evaluator);

        expect(result.overallMetrics.overallScore).toBe(0);
        expect(result.overallMetrics.avgFaithfulness).toBe(0);
        expect(result.overallMetrics.avgRelevance).toBe(0);
        expect(result.overallMetrics.toolCorrectnessRate).toBe(0);
        expect(result.overallMetrics.avgCostPerTask).toBe(0);
      });

      it('processes trajectories in concurrent batches', async () => {
        const order: string[] = [];
        const runner = new SuiteRunner({ concurrency: 2 });

        const evaluator = vi.fn().mockImplementation(async (t: Trajectory) => {
          order.push(t.trajectory_id ?? '');
          return makeEvalResult();
        });

        const trajectories = [makeTrajectory('t1'), makeTrajectory('t2'), makeTrajectory('t3')];

        await runner.run(trajectories, evaluator);

        expect(evaluator).toHaveBeenCalledTimes(3);
        expect(order).toHaveLength(3);
      });

      it('uses trajectory_id from trajectory object', async () => {
        const runner = new SuiteRunner({ concurrency: 1 });
        const traj = makeTrajectory('custom-id-42');
        const evaluator = vi.fn().mockResolvedValue(makeEvalResult());

        const result = await runner.run([traj], evaluator);

        expect(result.trajectoryResults[0]?.trajectoryId).toBe('custom-id-42');
      });
    });
  });

  describe('createSuiteRunner', () => {
    it('creates a SuiteRunner instance', () => {
      const runner = createSuiteRunner();
      expect(runner).toBeInstanceOf(SuiteRunner);
    });

    it('passes config to the runner', () => {
      const runner = createSuiteRunner({ concurrency: 20 });
      expect(runner).toBeInstanceOf(SuiteRunner);
    });
  });
});
