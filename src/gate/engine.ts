import type { AggregatedResults } from '../suite/results.js';
import type { RunComparisonResult } from '../suite/comparator.js';

/**
 * Gate types
 */
export type GateType = 'threshold' | 'baseline-comparison' | 'regression' | 'custom';

/**
 * Gate operator
 */
export type GateOperator = '>=' | '<=' | '>' | '<' | '==' | '!=';

/**
 * Gate definition
 */
export interface GateDefinition {
  /** Unique gate name */
  name: string;
  /** Gate type */
  type: GateType;
  /** Metric to check */
  metric?: string;
  /** Operator for comparison */
  operator?: GateOperator;
  /** Threshold value */
  threshold?: number;
  /** Baseline run ID for comparison */
  baseline?: string;
  /** Whether regression is allowed */
  allowRegression?: boolean;
  /** Custom evaluation function (for programmatic gates) */
  customFn?: (
    results: AggregatedResults,
    comparison?: RunComparisonResult,
  ) => { passed: boolean; reason: string };
  /** Whether gate is enabled */
  enabled?: boolean;
  /** Gate description */
  description?: string;
}

/**
 * Gate evaluation result
 */
export interface GateResult {
  /** Gate name */
  name: string;
  /** Whether gate passed */
  passed: boolean;
  /** Reason for pass/fail */
  reason: string;
  /** Actual value */
  actualValue?: number;
  /** Expected value */
  expectedValue?: number;
  /** Gate type */
  type: GateType;
}

/**
 * Gate evaluation summary
 */
export interface GateEvaluationSummary {
  /** Run ID */
  runId: string;
  /** Total gates */
  totalGates: number;
  /** Passed gates */
  passedGates: number;
  /** Failed gates */
  failedGates: number;
  /** Overall pass/fail */
  overallPassed: boolean;
  /** Individual gate results */
  results: GateResult[];
  /** Duration in ms */
  durationMs: number;
  /** Cache hit rate */
  cacheHitRate?: number;
}

/**
 * Gate cache entry
 */
interface GateCacheEntry {
  runId: string;
  results: GateResult[];
  timestamp: number;
  ttl: number;
}

/**
 * Gate Engine
 */
export class GateEngine {
  private gates: GateDefinition[];
  private cache: Map<string, GateCacheEntry> = new Map();
  private cacheTTL: number;

  constructor(gates: GateDefinition[], cacheTTL = 3600000) {
    this.gates = gates.filter((g) => g.enabled !== false);
    this.cacheTTL = cacheTTL;
  }

  /**
   * Evaluate all gates against results
   */
  evaluate(results: AggregatedResults, comparison?: RunComparisonResult): GateEvaluationSummary {
    const startTime = Date.now();

    // Check cache
    const cached = this.getFromCache(results.runId);
    if (cached) {
      return {
        runId: results.runId,
        totalGates: this.gates.length,
        passedGates: cached.filter((r) => r.passed).length,
        failedGates: cached.filter((r) => !r.passed).length,
        overallPassed: cached.every((r) => r.passed),
        results: cached,
        durationMs: Date.now() - startTime,
        cacheHitRate: 1,
      };
    }

    const gateResults: GateResult[] = [];

    for (const gate of this.gates) {
      const result = this.evaluateGate(gate, results, comparison);
      gateResults.push(result);
    }

    const passedGates = gateResults.filter((r) => r.passed).length;
    const failedGates = gateResults.length - passedGates;

    const summary: GateEvaluationSummary = {
      runId: results.runId,
      totalGates: this.gates.length,
      passedGates,
      failedGates,
      overallPassed: failedGates === 0,
      results: gateResults,
      durationMs: Date.now() - startTime,
    };

    // Cache results
    this.setCache(results.runId, gateResults);

    return summary;
  }

  /**
   * Evaluate a single gate
   */
  private evaluateGate(
    gate: GateDefinition,
    results: AggregatedResults,
    comparison?: RunComparisonResult,
  ): GateResult {
    switch (gate.type) {
      case 'threshold':
        return this.evaluateThresholdGate(gate, results);
      case 'baseline-comparison':
        return this.evaluateBaselineGate(gate, results, comparison);
      case 'regression':
        return this.evaluateRegressionGate(gate, comparison);
      case 'custom':
        return this.evaluateCustomGate(gate, results);
      default:
        return {
          name: gate.name,
          passed: false,
          reason: `Unknown gate type: ${gate.type}`,
          type: gate.type,
        };
    }
  }

  /**
   * Evaluate threshold gate
   */
  private evaluateThresholdGate(gate: GateDefinition, results: AggregatedResults): GateResult {
    const metricName = gate.metric;
    if (!metricName) {
      return {
        name: gate.name,
        passed: false,
        reason: 'Missing metric for threshold gate',
        type: gate.type,
      };
    }

    const metricBreakdown = results.metricBreakdown[metricName];
    if (!metricBreakdown) {
      return {
        name: gate.name,
        passed: false,
        reason: `Metric '${metricName}' not found`,
        type: gate.type,
      };
    }

    const actualValue = metricBreakdown.avgScore;
    const threshold = gate.threshold ?? 0;
    const operator = gate.operator ?? '>=';

    const passed = this.compareValues(actualValue, operator, threshold);

    return {
      name: gate.name,
      passed,
      reason: passed
        ? `${metricName} (${actualValue.toFixed(3)}) ${operator} ${threshold}`
        : `${metricName} (${actualValue.toFixed(3)}) failed ${operator} ${threshold}`,
      actualValue,
      expectedValue: threshold,
      type: gate.type,
    };
  }

  /**
   * Evaluate baseline comparison gate
   */
  private evaluateBaselineGate(
    gate: GateDefinition,
    _results: AggregatedResults,
    comparison?: RunComparisonResult,
  ): GateResult {
    if (!comparison) {
      return {
        name: gate.name,
        passed: false,
        reason: 'No comparison data available for baseline gate',
        type: gate.type,
      };
    }

    const metricName = gate.metric;
    if (!metricName) {
      return {
        name: gate.name,
        passed: false,
        reason: 'Missing metric for baseline gate',
        type: gate.type,
      };
    }

    const metricDiff = comparison.metricDiffs.find((d) => d.metric === metricName);
    if (!metricDiff) {
      return {
        name: gate.name,
        passed: false,
        reason: `Metric '${metricName}' not found in comparison`,
        type: gate.type,
      };
    }

    const allowRegression = gate.allowRegression ?? false;
    const passed = allowRegression || metricDiff.diff >= 0;

    return {
      name: gate.name,
      passed,
      reason: passed
        ? `${metricName}: ${metricDiff.baseline.toFixed(3)} → ${metricDiff.candidate.toFixed(3)} (${metricDiff.diff >= 0 ? 'no regression' : 'regression'})`
        : `${metricName}: ${metricDiff.baseline.toFixed(3)} → ${metricDiff.candidate.toFixed(3)} (regression not allowed)`,
      actualValue: metricDiff.candidate,
      expectedValue: metricDiff.baseline,
      type: gate.type,
    };
  }

  /**
   * Evaluate regression gate
   */
  private evaluateRegressionGate(
    gate: GateDefinition,
    comparison?: RunComparisonResult,
  ): GateResult {
    if (!comparison) {
      return {
        name: gate.name,
        passed: false,
        reason: 'No comparison data available for regression gate',
        type: gate.type,
      };
    }

    const regressions = comparison.regressions;
    const passed = regressions.length === 0;

    return {
      name: gate.name,
      passed,
      reason: passed
        ? 'No regressions detected'
        : `${regressions.length} regression(s) detected: ${regressions.map((r) => `${r.metric} (-${r.decline.toFixed(3)})`).join(', ')}`,
      type: gate.type,
    };
  }

  /**
   * Evaluate custom gate
   */
  private evaluateCustomGate(gate: GateDefinition, results: AggregatedResults): GateResult {
    if (!gate.customFn) {
      return {
        name: gate.name,
        passed: false,
        reason: 'Custom gate has no evaluation function',
        type: gate.type,
      };
    }

    try {
      const result = gate.customFn(results);
      return {
        name: gate.name,
        passed: result.passed,
        reason: result.reason,
        type: gate.type,
      };
    } catch (error) {
      return {
        name: gate.name,
        passed: false,
        reason: `Custom gate error: ${(error as Error).message}`,
        type: gate.type,
      };
    }
  }

  /**
   * Compare values with operator
   */
  private compareValues(actual: number, operator: GateOperator, expected: number): boolean {
    switch (operator) {
      case '>=':
        return actual >= expected;
      case '<=':
        return actual <= expected;
      case '>':
        return actual > expected;
      case '<':
        return actual < expected;
      case '==':
        return Math.abs(actual - expected) < 0.001;
      case '!=':
        return Math.abs(actual - expected) >= 0.001;
      default:
        return false;
    }
  }

  /**
   * Get from cache
   */
  private getFromCache(runId: string): GateResult[] | null {
    const entry = this.cache.get(runId);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(runId);
      return null;
    }

    return entry.results;
  }

  /**
   * Set cache
   */
  private setCache(runId: string, results: GateResult[]): void {
    this.cache.set(runId, {
      runId,
      results,
      timestamp: Date.now(),
      ttl: this.cacheTTL,
    });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get all gates
   */
  getGates(): GateDefinition[] {
    return [...this.gates];
  }

  /**
   * Add a gate
   */
  addGate(gate: GateDefinition): void {
    if (gate.enabled !== false) {
      this.gates.push(gate);
    }
  }

  /**
   * Remove a gate
   */
  removeGate(name: string): void {
    this.gates = this.gates.filter((g) => g.name !== name);
  }
}

/**
 * Create gate engine
 */
export function createGateEngine(gates: GateDefinition[]): GateEngine {
  return new GateEngine(gates);
}
