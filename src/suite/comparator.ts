import type { AggregatedResults } from './results.js';

/**
 * Comparison result between two evaluation runs
 */
export interface RunComparisonResult {
  /** Baseline run ID */
  baselineRunId: string;
  /** Candidate run ID */
  candidateRunId: string;
  /** Overall score difference */
  scoreDiff: number;
  /** Per-metric differences */
  metricDiffs: MetricDiff[];
  /** Statistical significance */
  statisticalSignificance: StatisticalResult;
  /** Regressions detected */
  regressions: RegressionInfo[];
  /** Improvements detected */
  improvements: ImprovementInfo[];
  /** Summary */
  summary: ComparisonSummary;
}

/**
 * Per-metric difference
 */
export interface MetricDiff {
  metric: string;
  baseline: number;
  candidate: number;
  diff: number;
  percentChange: number;
  effectSize: number;
}

/**
 * Statistical test result
 */
export interface StatisticalResult {
  /** Test used */
  test: string;
  /** P-value */
  pValue: number;
  /** Confidence interval */
  confidenceInterval: [number, number];
  /** Whether difference is significant */
  significant: boolean;
  /** Significance level */
  alpha: number;
}

/**
 * Regression information
 */
export interface RegressionInfo {
  metric: string;
  baseline: number;
  candidate: number;
  decline: number;
  severity: 'low' | 'medium' | 'high';
}

/**
 * Improvement information
 */
export interface ImprovementInfo {
  metric: string;
  baseline: number;
  candidate: number;
  gain: number;
  significance: 'minor' | 'moderate' | 'major';
}

/**
 * Comparison summary
 */
export interface ComparisonSummary {
  /** Overall verdict */
  verdict: 'improved' | 'regressed' | 'unchanged' | 'mixed';
  /** Description */
  description: string;
  /** Recommendation */
  recommendation: 'approve' | 'review' | 'reject';
  /** Key findings */
  keyFindings: string[];
}

/**
 * Visualization data for charts
 */
export interface VisualizationData {
  /** Data for bar chart comparison */
  barChart: Array<{ metric: string; baseline: number; candidate: number }>;
  /** Data for waterfall chart */
  waterfall: Array<{ metric: string; change: number; cumulative: number }>;
  /** Data for heatmap */
  heatmap: Array<{ metric: string; value: number; category: 'baseline' | 'candidate' }>;
}

/**
 * Run Comparator
 */
export class RunComparator {
  private significanceLevel: number;
  private minEffectSize: number;

  constructor(significanceLevel = 0.05, minEffectSize = 0.1) {
    this.significanceLevel = significanceLevel;
    this.minEffectSize = minEffectSize;
  }

  /**
   * Compare two evaluation runs
   */
  compare(baseline: AggregatedResults, candidate: AggregatedResults): RunComparisonResult {
    const metricDiffs = this.calculateMetricDiffs(baseline, candidate);
    const scoreDiff = candidate.overallMetrics.overallScore - baseline.overallMetrics.overallScore;
    const statisticalSignificance = this.testSignificance(baseline, candidate);

    const regressions = this.detectRegressions(metricDiffs);
    const improvements = this.detectImprovements(metricDiffs);

    const summary = this.generateSummary(
      scoreDiff,
      regressions,
      improvements,
      statisticalSignificance,
    );

    return {
      baselineRunId: baseline.runId,
      candidateRunId: candidate.runId,
      scoreDiff: Math.round(scoreDiff * 1000) / 1000,
      metricDiffs,
      statisticalSignificance,
      regressions,
      improvements,
      summary,
    };
  }

  /**
   * Calculate per-metric differences
   */
  private calculateMetricDiffs(
    baseline: AggregatedResults,
    candidate: AggregatedResults,
  ): MetricDiff[] {
    const diffs: MetricDiff[] = [];

    for (const [key, baselineMetric] of Object.entries(baseline.metricBreakdown)) {
      const candidateMetric = candidate.metricBreakdown[key];
      if (candidateMetric) {
        const diff = candidateMetric.avgScore - baselineMetric.avgScore;
        const percentChange =
          baselineMetric.avgScore > 0 ? (diff / baselineMetric.avgScore) * 100 : 0;
        const effectSize = this.calculateEffectSize(baselineMetric, candidateMetric);

        diffs.push({
          metric: key,
          baseline: baselineMetric.avgScore,
          candidate: candidateMetric.avgScore,
          diff: Math.round(diff * 1000) / 1000,
          percentChange: Math.round(percentChange * 100) / 100,
          effectSize: Math.round(effectSize * 1000) / 1000,
        });
      }
    }

    return diffs;
  }

  /**
   * Calculate Cohen's d effect size
   */
  private calculateEffectSize(
    baseline: { avgScore: number; stdDev: number },
    candidate: { avgScore: number; stdDev: number },
  ): number {
    const pooledStd = Math.sqrt((baseline.stdDev ** 2 + candidate.stdDev ** 2) / 2);
    if (pooledStd === 0) return 0;
    return (candidate.avgScore - baseline.avgScore) / pooledStd;
  }

  /**
   * Test statistical significance (simplified t-test)
   */
  private testSignificance(
    baseline: AggregatedResults,
    candidate: AggregatedResults,
  ): StatisticalResult {
    const n1 = baseline.summary.totalTrajectories;
    const n2 = candidate.summary.totalTrajectories;
    const mean1 = baseline.overallMetrics.overallScore;
    const mean2 = candidate.overallMetrics.overallScore;

    // Simplified variance estimation
    const var1 = 0.01; // Assume some variance
    const var2 = 0.01;

    const se = Math.sqrt(var1 / n1 + var2 / n2);
    const tStat = se > 0 ? (mean2 - mean1) / se : 0;

    // Approximate p-value (simplified)
    const pValue = this.approximatePValue(Math.abs(tStat), Math.min(n1, n2) - 1);

    const diff = mean2 - mean1;
    const ci: [number, number] = [
      Math.round((diff - 1.96 * se) * 1000) / 1000,
      Math.round((diff + 1.96 * se) * 1000) / 1000,
    ];

    return {
      test: 't-test',
      pValue: Math.round(pValue * 10000) / 10000,
      confidenceInterval: ci,
      significant: pValue < this.significanceLevel,
      alpha: this.significanceLevel,
    };
  }

  /**
   * Approximate p-value from t-statistic
   */
  private approximatePValue(tStat: number, df: number): number {
    // Simplified approximation
    const x = df / (df + tStat * tStat);
    if (x >= 1) return 1;
    if (x <= 0) return 0;
    return Math.pow(x, df / 2);
  }

  /**
   * Detect regressions
   */
  private detectRegressions(metricDiffs: MetricDiff[]): RegressionInfo[] {
    return metricDiffs
      .filter((d) => d.diff < -this.minEffectSize)
      .map((d) => ({
        metric: d.metric,
        baseline: d.baseline,
        candidate: d.candidate,
        decline: Math.round(Math.abs(d.diff) * 1000) / 1000,
        severity: this.classifySeverity(Math.abs(d.diff)),
      }));
  }

  /**
   * Detect improvements
   */
  private detectImprovements(metricDiffs: MetricDiff[]): ImprovementInfo[] {
    return metricDiffs
      .filter((d) => d.diff > this.minEffectSize)
      .map((d) => ({
        metric: d.metric,
        baseline: d.baseline,
        candidate: d.candidate,
        gain: Math.round(d.diff * 1000) / 1000,
        significance: this.classifyImprovement(Math.abs(d.diff)),
      }));
  }

  /**
   * Classify regression severity
   */
  private classifySeverity(decline: number): 'low' | 'medium' | 'high' {
    if (decline > 0.2) return 'high';
    if (decline > 0.1) return 'medium';
    return 'low';
  }

  /**
   * Classify improvement significance
   */
  private classifyImprovement(gain: number): 'minor' | 'moderate' | 'major' {
    if (gain > 0.2) return 'major';
    if (gain > 0.1) return 'moderate';
    return 'minor';
  }

  /**
   * Generate comparison summary
   */
  private generateSummary(
    scoreDiff: number,
    regressions: RegressionInfo[],
    improvements: ImprovementInfo[],
    significance: StatisticalResult,
  ): ComparisonSummary {
    const keyFindings: string[] = [];

    // Determine verdict
    let verdict: ComparisonSummary['verdict'];
    let recommendation: ComparisonSummary['recommendation'];

    if (regressions.length > 0 && improvements.length === 0) {
      verdict = 'regressed';
      recommendation = 'reject';
      keyFindings.push(`${regressions.length} metric(s) regressed`);
    } else if (improvements.length > 0 && regressions.length === 0) {
      verdict = 'improved';
      recommendation = significance.significant ? 'approve' : 'review';
      keyFindings.push(`${improvements.length} metric(s) improved`);
    } else if (regressions.length > 0 && improvements.length > 0) {
      verdict = 'mixed';
      recommendation = 'review';
      keyFindings.push(
        `${regressions.length} regression(s), ${improvements.length} improvement(s)`,
      );
    } else {
      verdict = 'unchanged';
      recommendation = 'approve';
      keyFindings.push('No significant changes detected');
    }

    if (significance.significant) {
      keyFindings.push(
        `Statistically significant difference (p=${significance.pValue.toFixed(4)})`,
      );
    }

    if (scoreDiff > 0) {
      keyFindings.push(`Overall score improved by ${(scoreDiff * 100).toFixed(1)}%`);
    } else if (scoreDiff < 0) {
      keyFindings.push(`Overall score declined by ${(Math.abs(scoreDiff) * 100).toFixed(1)}%`);
    }

    return {
      verdict,
      description: `Candidate ${verdict} compared to baseline`,
      recommendation,
      keyFindings,
    };
  }

  /**
   * Generate visualization data
   */
  generateVisualizationData(comparison: RunComparisonResult): VisualizationData {
    const barChart = comparison.metricDiffs.map((d) => ({
      metric: d.metric,
      baseline: d.baseline,
      candidate: d.candidate,
    }));

    let cumulative = 0;
    const waterfall = comparison.metricDiffs.map((d) => {
      cumulative += d.diff;
      return { metric: d.metric, change: d.diff, cumulative };
    });

    const heatmap = [
      ...comparison.metricDiffs.map((d) => ({
        metric: d.metric,
        value: d.baseline,
        category: 'baseline' as const,
      })),
      ...comparison.metricDiffs.map((d) => ({
        metric: d.metric,
        value: d.candidate,
        category: 'candidate' as const,
      })),
    ];

    return { barChart, waterfall, heatmap };
  }
}

/**
 * Create run comparator
 */
export function createRunComparator(
  significanceLevel?: number,
  minEffectSize?: number,
): RunComparator {
  return new RunComparator(significanceLevel, minEffectSize);
}
