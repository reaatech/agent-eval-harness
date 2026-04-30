import { describe, expect, it } from 'vitest';
import { RunComparator, createRunComparator } from './comparator.js';
import { makeAggregatedResults, makeOverallMetrics } from './test-helpers.js';

describe('comparator', () => {
  describe('RunComparator', () => {
    it('creates with default parameters', () => {
      const comparator = new RunComparator();
      expect(comparator).toBeDefined();
    });

    it('creates with custom parameters', () => {
      const comparator = new RunComparator(0.01, 0.2);
      expect(comparator).toBeDefined();
    });

    describe('compare', () => {
      it('returns RunComparisonResult with correct run IDs', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({ runId: 'base-001' });
        const candidate = makeAggregatedResults({ runId: 'cand-001' });

        const result = comparator.compare(baseline, candidate);

        expect(result.baselineRunId).toBe('base-001');
        expect(result.candidateRunId).toBe('cand-001');
      });

      it('reports improved verdict when candidate scores higher', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({
          overallMetrics: makeOverallMetrics({ overallScore: 0.7 }),
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.7,
              minScore: 0.6,
              maxScore: 0.8,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          overallMetrics: makeOverallMetrics({ overallScore: 0.9 }),
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.9,
              minScore: 0.85,
              maxScore: 0.95,
              stdDev: 0.04,
              passRate: 1,
              weight: 0.3,
            },
          },
        });

        const result = comparator.compare(baseline, candidate);

        expect(result.summary.verdict).toBe('improved');
        expect(result.scoreDiff).toBeGreaterThan(0);
      });

      it('reports regressed verdict when candidate scores lower', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({
          overallMetrics: makeOverallMetrics({ overallScore: 0.9 }),
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.9,
              minScore: 0.85,
              maxScore: 0.95,
              stdDev: 0.04,
              passRate: 1,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          overallMetrics: makeOverallMetrics({ overallScore: 0.7 }),
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.7,
              minScore: 0.6,
              maxScore: 0.8,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });

        const result = comparator.compare(baseline, candidate);

        expect(result.summary.verdict).toBe('regressed');
        expect(result.scoreDiff).toBeLessThan(0);
        expect(result.regressions.length).toBeGreaterThan(0);
      });

      it('reports unchanged when scores are similar', () => {
        const comparator = new RunComparator(0.05, 0.5);
        const baseline = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.85,
              minScore: 0.8,
              maxScore: 0.9,
              stdDev: 0.03,
              passRate: 1,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.86,
              minScore: 0.81,
              maxScore: 0.91,
              stdDev: 0.03,
              passRate: 1,
              weight: 0.3,
            },
          },
        });

        const result = comparator.compare(baseline, candidate);

        expect(result.summary.verdict).toBe('unchanged');
      });

      it('reports mixed verdict when some metrics improve and some regress', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.7,
              minScore: 0.6,
              maxScore: 0.8,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
            relevance: {
              name: 'relevance',
              avgScore: 0.9,
              minScore: 0.85,
              maxScore: 0.95,
              stdDev: 0.04,
              passRate: 1,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.9,
              minScore: 0.85,
              maxScore: 0.95,
              stdDev: 0.04,
              passRate: 1,
              weight: 0.3,
            },
            relevance: {
              name: 'relevance',
              avgScore: 0.6,
              minScore: 0.5,
              maxScore: 0.7,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });

        const result = comparator.compare(baseline, candidate);

        expect(result.summary.verdict).toBe('mixed');
        expect(result.regressions.length).toBeGreaterThan(0);
        expect(result.improvements.length).toBeGreaterThan(0);
        expect(result.summary.recommendation).toBe('review');
      });

      it('computes metric diffs for matching metrics', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.8,
              minScore: 0.7,
              maxScore: 0.9,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.85,
              minScore: 0.75,
              maxScore: 0.95,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });

        const result = comparator.compare(baseline, candidate);

        expect(result.metricDiffs).toHaveLength(1);
        expect(result.metricDiffs[0]?.metric).toBe('faithfulness');
        expect(result.metricDiffs[0]?.baseline).toBe(0.8);
        expect(result.metricDiffs[0]?.candidate).toBe(0.85);
        expect(result.metricDiffs[0]?.diff).toBe(0.05);
      });

      it('skips metrics that only exist in baseline', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.8,
              minScore: 0.7,
              maxScore: 0.9,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
            extra_metric: {
              name: 'extra_metric',
              avgScore: 0.5,
              minScore: 0.4,
              maxScore: 0.6,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.2,
            },
          },
        });
        const candidate = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.85,
              minScore: 0.75,
              maxScore: 0.95,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });

        const result = comparator.compare(baseline, candidate);

        expect(result.metricDiffs).toHaveLength(1);
        expect(result.metricDiffs[0]?.metric).toBe('faithfulness');
      });

      it('calculates percent change correctly', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.8,
              minScore: 0.7,
              maxScore: 0.9,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.9,
              minScore: 0.8,
              maxScore: 1.0,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });

        const result = comparator.compare(baseline, candidate);

        expect(result.metricDiffs[0]?.percentChange).toBe(12.5);
      });

      it('includes statistical significance result', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults();
        const candidate = makeAggregatedResults();

        const result = comparator.compare(baseline, candidate);

        expect(result.statisticalSignificance).toBeDefined();
        expect(result.statisticalSignificance.test).toBe('t-test');
        expect(result.statisticalSignificance.alpha).toBe(0.05);
        expect(typeof result.statisticalSignificance.pValue).toBe('number');
        expect(result.statisticalSignificance.confidenceInterval).toHaveLength(2);
        expect(typeof result.statisticalSignificance.significant).toBe('boolean');
      });

      it('classifies high severity regressions', () => {
        const comparator = new RunComparator(0.05, 0.01);
        const baseline = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.9,
              minScore: 0.85,
              maxScore: 0.95,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.5,
              minScore: 0.4,
              maxScore: 0.6,
              stdDev: 0.05,
              passRate: 0.5,
              weight: 0.3,
            },
          },
        });

        const result = comparator.compare(baseline, candidate);

        expect(result.regressions.length).toBeGreaterThan(0);
        expect(result.regressions[0]?.severity).toBe('high');
      });

      it('classifies major improvements', () => {
        const comparator = new RunComparator(0.05, 0.01);
        const baseline = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.5,
              minScore: 0.4,
              maxScore: 0.6,
              stdDev: 0.05,
              passRate: 0.5,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.9,
              minScore: 0.85,
              maxScore: 0.95,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });

        const result = comparator.compare(baseline, candidate);

        expect(result.improvements.length).toBeGreaterThan(0);
        expect(result.improvements[0]?.significance).toBe('major');
      });

      it('generates key findings', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults();
        const candidate = makeAggregatedResults();

        const result = comparator.compare(baseline, candidate);

        expect(result.summary.keyFindings.length).toBeGreaterThan(0);
      });

      it('recommends approve for improved runs', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({
          overallMetrics: makeOverallMetrics({ overallScore: 0.7 }),
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.7,
              minScore: 0.6,
              maxScore: 0.8,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          overallMetrics: makeOverallMetrics({ overallScore: 0.9 }),
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.9,
              minScore: 0.85,
              maxScore: 0.95,
              stdDev: 0.04,
              passRate: 1,
              weight: 0.3,
            },
          },
        });

        const result = comparator.compare(baseline, candidate);
        expect(['approve', 'review']).toContain(result.summary.recommendation);
      });

      it('recommends reject for regressed runs', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({
          overallMetrics: makeOverallMetrics({ overallScore: 0.9 }),
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.9,
              minScore: 0.85,
              maxScore: 0.95,
              stdDev: 0.04,
              passRate: 1,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          overallMetrics: makeOverallMetrics({ overallScore: 0.6 }),
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.6,
              minScore: 0.5,
              maxScore: 0.7,
              stdDev: 0.05,
              passRate: 0.8,
              weight: 0.3,
            },
          },
        });

        const result = comparator.compare(baseline, candidate);
        expect(result.summary.recommendation).toBe('reject');
      });

      it('rounds scoreDiff to 3 decimal places', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({
          overallMetrics: makeOverallMetrics({ overallScore: 0.8333 }),
        });
        const candidate = makeAggregatedResults({
          overallMetrics: makeOverallMetrics({ overallScore: 0.9666 }),
        });

        const result = comparator.compare(baseline, candidate);
        const decimals = result.scoreDiff.toString().split('.')[1]?.length || 0;
        expect(decimals).toBeLessThanOrEqual(3);
      });
    });

    describe('generateVisualizationData', () => {
      it('produces VisualizationData with barChart', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.8,
              minScore: 0.7,
              maxScore: 0.9,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.85,
              minScore: 0.75,
              maxScore: 0.95,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });

        const comparison = comparator.compare(baseline, candidate);
        const viz = comparator.generateVisualizationData(comparison);

        expect(viz.barChart).toHaveLength(1);
        expect(viz.barChart[0]?.metric).toBe('faithfulness');
        expect(viz.barChart[0]?.baseline).toBe(0.8);
        expect(viz.barChart[0]?.candidate).toBe(0.85);
      });

      it('produces waterfall data with cumulative sums', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.8,
              minScore: 0.7,
              maxScore: 0.9,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
            relevance: {
              name: 'relevance',
              avgScore: 0.7,
              minScore: 0.6,
              maxScore: 0.8,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.9,
              minScore: 0.85,
              maxScore: 0.95,
              stdDev: 0.04,
              passRate: 1,
              weight: 0.3,
            },
            relevance: {
              name: 'relevance',
              avgScore: 0.6,
              minScore: 0.5,
              maxScore: 0.7,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });

        const comparison = comparator.compare(baseline, candidate);
        const viz = comparator.generateVisualizationData(comparison);

        expect(viz.waterfall).toHaveLength(2);
        expect(viz.waterfall[0]?.change).toBe(0.1);
        expect(viz.waterfall[0]?.cumulative).toBe(0.1);
        expect(viz.waterfall[1]?.cumulative).toBeCloseTo(0.0, 2);
      });

      it('produces heatmap with baseline and candidate entries', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.8,
              minScore: 0.7,
              maxScore: 0.9,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.85,
              minScore: 0.75,
              maxScore: 0.95,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });

        const comparison = comparator.compare(baseline, candidate);
        const viz = comparator.generateVisualizationData(comparison);

        expect(viz.heatmap).toHaveLength(2);
        expect(viz.heatmap[0]?.category).toBe('baseline');
        expect(viz.heatmap[1]?.category).toBe('candidate');
      });

      it('returns empty arrays for comparison with no matching metrics', () => {
        const comparator = new RunComparator();
        const baseline = makeAggregatedResults({
          metricBreakdown: {
            faithfulness: {
              name: 'faithfulness',
              avgScore: 0.8,
              minScore: 0.7,
              maxScore: 0.9,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });
        const candidate = makeAggregatedResults({
          metricBreakdown: {
            relevance: {
              name: 'relevance',
              avgScore: 0.85,
              minScore: 0.75,
              maxScore: 0.95,
              stdDev: 0.05,
              passRate: 1,
              weight: 0.3,
            },
          },
        });

        const comparison = comparator.compare(baseline, candidate);
        const viz = comparator.generateVisualizationData(comparison);

        expect(viz.barChart).toHaveLength(0);
        expect(viz.waterfall).toHaveLength(0);
        expect(viz.heatmap).toHaveLength(0);
      });
    });
  });

  describe('createRunComparator', () => {
    it('creates a RunComparator instance', () => {
      const comparator = createRunComparator();
      expect(comparator).toBeInstanceOf(RunComparator);
    });

    it('passes significance level', () => {
      const comparator = createRunComparator(0.01);
      expect(comparator).toBeInstanceOf(RunComparator);
    });

    it('passes both parameters', () => {
      const comparator = createRunComparator(0.01, 0.2);
      expect(comparator).toBeInstanceOf(RunComparator);
    });
  });
});
