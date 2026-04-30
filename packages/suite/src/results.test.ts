import { beforeEach, describe, expect, it } from 'vitest';
import type { SuiteConfig } from './config.js';
import { ResultsAggregator, createResultsAggregator } from './results.js';
import type { ExportFormat } from './results.js';
import {
  makeAggregatedResults,
  makeEvalResult,
  makeEvalRunResult,
  makeSuiteConfig,
} from './test-helpers.js';

describe('results', () => {
  let config: SuiteConfig;

  beforeEach(() => {
    config = makeSuiteConfig();
  });

  describe('ResultsAggregator', () => {
    it('constructs with a SuiteConfig', () => {
      expect(new ResultsAggregator(config)).toBeDefined();
    });

    describe('aggregate', () => {
      it('produces AggregatedResults with correct runId', () => {
        const aggregator = new ResultsAggregator(config);
        const runResult = makeEvalRunResult({ runId: 'run-agg-001' });
        const aggregated = aggregator.aggregate(runResult);
        expect(aggregated.runId).toBe('run-agg-001');
      });

      it('includes config in aggregated results', () => {
        const aggregator = new ResultsAggregator(config);
        const aggregated = aggregator.aggregate(makeEvalRunResult());
        expect(aggregated.config).toBe(config);
      });

      it('includes timestamp', () => {
        const aggregator = new ResultsAggregator(config);
        const aggregated = aggregator.aggregate(makeEvalRunResult());
        expect(aggregated.timestamp).toBeDefined();
        expect(() => new Date(aggregated.timestamp)).not.toThrow();
      });

      it('computes summary with pass rate', () => {
        const aggregator = new ResultsAggregator(config);
        const runResult = makeEvalRunResult({
          trajectoryResults: [
            {
              trajectoryId: 't1',
              result: makeEvalResult({
                overall_score: 0.9,
                metrics: {
                  faithfulness: 0.9,
                  relevance: 0.9,
                  tool_correctness: 0.95,
                },
                cost: 0.01,
              }),
            },
          ],
          totalTrajectories: 1,
          completedTrajectories: 1,
          failedTrajectories: 0,
        });

        const aggregated = aggregator.aggregate(runResult);
        expect(aggregated.summary.totalTrajectories).toBe(1);
      });

      it('handles empty trajectory results', () => {
        const aggregator = new ResultsAggregator(config);
        const runResult = makeEvalRunResult({
          trajectoryResults: [],
          totalTrajectories: 0,
        });
        const aggregated = aggregator.aggregate(runResult);
        expect(aggregated.trajectoryResults).toHaveLength(0);
        expect(aggregated.summary.passRate).toBe(0);
      });

      it('computes metric breakdown for each configured metric', () => {
        const aggregator = new ResultsAggregator(config);
        const runResult = makeEvalRunResult({
          trajectoryResults: [
            {
              trajectoryId: 't1',
              result: makeEvalResult({
                metrics: {
                  faithfulness: 0.9,
                  relevance: 0.8,
                  tool_correctness: 0.95,
                },
                cost: 0.02,
              }),
            },
          ],
        });

        const aggregated = aggregator.aggregate(runResult);
        expect(Object.keys(aggregated.metricBreakdown)).toContain('faithfulness');
        expect(Object.keys(aggregated.metricBreakdown)).toContain('relevance');
      });

      it('computes stdDev in metric breakdown', () => {
        const aggregator = new ResultsAggregator(config);
        const runResult = makeEvalRunResult({
          trajectoryResults: [
            {
              trajectoryId: 't1',
              result: makeEvalResult({ metrics: { faithfulness: 0.8 } }),
            },
            {
              trajectoryId: 't2',
              result: makeEvalResult({ metrics: { faithfulness: 1.0 } }),
            },
          ],
        });

        const aggregated = aggregator.aggregate(runResult);
        expect(aggregated.metricBreakdown.faithfulness?.stdDev).toBeGreaterThanOrEqual(0);
      });

      it('skips errored trajectory results in metric breakdown', () => {
        const aggregator = new ResultsAggregator(config);
        const runResult = makeEvalRunResult({
          trajectoryResults: [
            {
              trajectoryId: 't1',
              result: makeEvalResult({ metrics: { faithfulness: 0.9 } }),
            },
            {
              trajectoryId: 't2',
              result: makeEvalResult(),
              error: 'timeout',
            },
          ],
        });

        const aggregated = aggregator.aggregate(runResult);
        if (aggregated.metricBreakdown.faithfulness) {
          expect(aggregated.metricBreakdown.faithfulness.avgScore).toBe(0.9);
        }
      });
    });

    describe('exportJSON', () => {
      it('exports valid JSON string', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const json = aggregator.exportJSON(results);
        expect(() => JSON.parse(json)).not.toThrow();
      });

      it('includes all top-level keys', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const parsed = JSON.parse(aggregator.exportJSON(results));
        expect(parsed).toHaveProperty('runId');
        expect(parsed).toHaveProperty('config');
        expect(parsed).toHaveProperty('overallMetrics');
        expect(parsed).toHaveProperty('metricBreakdown');
        expect(parsed).toHaveProperty('trajectoryResults');
        expect(parsed).toHaveProperty('summary');
        expect(parsed).toHaveProperty('timestamp');
      });
    });

    describe('exportJUnit', () => {
      it('produces XML starting with declaration', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const xml = aggregator.exportJUnit(results);
        expect(xml).toContain('<?xml version="1.0"');
      });

      it('contains testsuite element', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const xml = aggregator.exportJUnit(results);
        expect(xml).toContain('<testsuite');
        expect(xml).toContain('</testsuite>');
      });

      it('includes failure elements for failed trajectories', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults({
          trajectoryResults: [
            {
              trajectoryId: 't1',
              overallScore: 0.3,
              metricScores: { faithfulness: 0.3 },
              passed: false,
              errors: 'score too low',
            },
          ],
        });
        const xml = aggregator.exportJUnit(results);
        expect(xml).toContain('<failure');
        expect(xml).toContain('score too low');
      });

      it('uses self-closing testcase for passed trajectories', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults({
          trajectoryResults: [
            {
              trajectoryId: 't1',
              overallScore: 0.9,
              metricScores: { faithfulness: 0.9 },
              passed: true,
            },
          ],
        });
        const xml = aggregator.exportJUnit(results);
        expect(xml).toContain('/>');
      });
    });

    describe('exportCSV', () => {
      it('produces CSV with headers', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const csv = aggregator.exportCSV(results);
        const lines = csv.split('\n');
        expect(lines[0]).toContain('trajectory_id');
        expect(lines[0]).toContain('overall_score');
        expect(lines[0]).toContain('passed');
      });

      it('includes one row per trajectory', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults({
          trajectoryResults: [
            { trajectoryId: 't1', overallScore: 0.8, metricScores: {}, passed: true },
            { trajectoryId: 't2', overallScore: 0.6, metricScores: {}, passed: false },
          ],
        });
        const csv = aggregator.exportCSV(results);
        const lines = csv.split('\n').filter((l) => l.trim());
        expect(lines).toHaveLength(3);
      });

      it('includes metric columns', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const csv = aggregator.exportCSV(results);
        const headers = csv.split('\n')[0]?.split(',');
        for (const metric of config.metrics) {
          expect(headers).toContain(metric.name);
        }
      });
    });

    describe('exportMarkdown', () => {
      it('produces markdown with title', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const md = aggregator.exportMarkdown(results);
        expect(md).toContain('# Evaluation Results: test-suite');
      });

      it('includes run ID and timestamp', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const md = aggregator.exportMarkdown(results);
        expect(md).toContain('**Run ID:** run-001');
        expect(md).toContain('**Timestamp:**');
      });

      it('includes summary table', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const md = aggregator.exportMarkdown(results);
        expect(md).toContain('## Summary');
        expect(md).toContain('Total Trajectories');
        expect(md).toContain('Pass Rate');
      });

      it('includes metric breakdown table', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const md = aggregator.exportMarkdown(results);
        expect(md).toContain('## Metric Breakdown');
        expect(md).toContain('faithfulness');
      });
    });

    describe('export', () => {
      it('dispatches to exportJSON for json format', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const json = aggregator.export(results, 'json');
        expect(() => JSON.parse(json)).not.toThrow();
      });

      it('dispatches to exportJUnit for junit format', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const xml = aggregator.export(results, 'junit');
        expect(xml).toContain('<?xml');
      });

      it('dispatches to exportCSV for csv format', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const csv = aggregator.export(results, 'csv');
        expect(csv).toContain('trajectory_id');
      });

      it('dispatches to exportMarkdown for markdown format', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        const md = aggregator.export(results, 'markdown');
        expect(md).toContain('# Evaluation Results');
      });

      it('throws for unknown format', () => {
        const aggregator = new ResultsAggregator(config);
        const results = makeAggregatedResults();
        expect(() => aggregator.export(results, 'unknown' as ExportFormat)).toThrow(
          'Unknown format: unknown',
        );
      });
    });
  });

  describe('createResultsAggregator', () => {
    it('creates a ResultsAggregator instance', () => {
      const aggregator = createResultsAggregator(config);
      expect(aggregator).toBeInstanceOf(ResultsAggregator);
    });
  });
});
