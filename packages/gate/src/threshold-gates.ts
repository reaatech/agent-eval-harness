import type { AggregatedResults } from '@reaatech/agent-eval-harness-suite';
import type { GateDefinition } from './engine.js';

/**
 * Threshold gate presets
 */
export interface ThresholdGatePreset {
  /** Preset name */
  name: string;
  /** Gates to include */
  gates: GateDefinition[];
}

/**
 * Create overall quality threshold gate
 */
export function createOverallQualityGate(threshold = 0.8): GateDefinition {
  return {
    name: 'overall-quality',
    type: 'threshold',
    metric: 'overall_score',
    operator: '>=',
    threshold,
    description: `Overall quality score must be >= ${threshold}`,
  };
}

/**
 * Create faithfulness threshold gate
 */
export function createFaithfulnessGate(threshold = 0.8): GateDefinition {
  return {
    name: 'faithfulness',
    type: 'threshold',
    metric: 'faithfulness',
    operator: '>=',
    threshold,
    description: `Faithfulness score must be >= ${threshold}`,
  };
}

/**
 * Create relevance threshold gate
 */
export function createRelevanceGate(threshold = 0.8): GateDefinition {
  return {
    name: 'relevance',
    type: 'threshold',
    metric: 'relevance',
    operator: '>=',
    threshold,
    description: `Relevance score must be >= ${threshold}`,
  };
}

/**
 * Create tool correctness threshold gate
 */
export function createToolCorrectnessGate(threshold = 0.9): GateDefinition {
  return {
    name: 'tool-correctness',
    type: 'threshold',
    metric: 'tool_correctness',
    operator: '>=',
    threshold,
    description: `Tool correctness rate must be >= ${threshold}`,
  };
}

/**
 * Create cost-per-task threshold gate
 */
export function createCostGate(maxCost = 0.05): GateDefinition {
  return {
    name: 'cost-per-task',
    type: 'threshold',
    metric: 'cost',
    operator: '<=',
    threshold: maxCost,
    description: `Cost per task must be <= $${maxCost.toFixed(2)}`,
  };
}

/**
 * Create latency P99 threshold gate
 */
export function createLatencyGate(maxLatencyMs = 5000): GateDefinition {
  return {
    name: 'latency-p99',
    type: 'threshold',
    metric: 'latency',
    operator: '<=',
    threshold: maxLatencyMs,
    description: `P99 latency must be <= ${maxLatencyMs}ms`,
  };
}

/**
 * Create pass rate threshold gate
 */
export function createPassRateGate(minPassRate = 0.95): GateDefinition {
  return {
    name: 'pass-rate',
    type: 'custom',
    customFn: (results: AggregatedResults): { passed: boolean; reason: string } => {
      const passRate = results.summary.passRate / 100;
      const passed = passRate >= minPassRate;
      return {
        passed,
        reason: passed
          ? `Pass rate ${(passRate * 100).toFixed(1)}% >= ${(minPassRate * 100).toFixed(1)}%`
          : `Pass rate ${(passRate * 100).toFixed(1)}% < ${(minPassRate * 100).toFixed(1)}%`,
      };
    },
    description: `Pass rate must be >= ${(minPassRate * 100).toFixed(0)}%`,
  };
}

/**
 * Create SLA violation gate
 */
export function createSLAViolationsGate(maxViolations = 0): GateDefinition {
  return {
    name: 'sla-violations',
    type: 'custom',
    customFn: (results: AggregatedResults): { passed: boolean; reason: string } => {
      const violations = results.overallMetrics.slaViolations;
      const passed = violations <= maxViolations;
      return {
        passed,
        reason: passed
          ? `SLA violations (${violations}) <= ${maxViolations}`
          : `SLA violations (${violations}) > ${maxViolations}`,
      };
    },
    description: `SLA violations must be <= ${maxViolations}`,
  };
}

/**
 * Get standard threshold gates preset
 */
export function getStandardPreset(): ThresholdGatePreset {
  return {
    name: 'standard',
    gates: [
      createOverallQualityGate(0.8),
      createFaithfulnessGate(0.8),
      createRelevanceGate(0.8),
      createToolCorrectnessGate(0.9),
      createCostGate(0.05),
      createLatencyGate(5000),
      createPassRateGate(0.95),
    ],
  };
}

/**
 * Get strict threshold gates preset
 */
export function getStrictPreset(): ThresholdGatePreset {
  return {
    name: 'strict',
    gates: [
      createOverallQualityGate(0.9),
      createFaithfulnessGate(0.9),
      createRelevanceGate(0.9),
      createToolCorrectnessGate(0.95),
      createCostGate(0.02),
      createLatencyGate(2000),
      createPassRateGate(0.99),
      createSLAViolationsGate(0),
    ],
  };
}

/**
 * Get lenient threshold gates preset
 */
export function getLenientPreset(): ThresholdGatePreset {
  return {
    name: 'lenient',
    gates: [
      createOverallQualityGate(0.6),
      createFaithfulnessGate(0.6),
      createRelevanceGate(0.6),
      createToolCorrectnessGate(0.7),
      createCostGate(0.1),
      createLatencyGate(10000),
    ],
  };
}

/**
 * Build threshold gates from configuration
 */
export function buildThresholdGates(config: {
  overallQuality?: number;
  faithfulness?: number;
  relevance?: number;
  toolCorrectness?: number;
  costPerTask?: number;
  latencyP99?: number;
  passRate?: number;
  maxSLAViolations?: number;
}): GateDefinition[] {
  const gates: GateDefinition[] = [];

  if (config.overallQuality !== undefined) {
    gates.push(createOverallQualityGate(config.overallQuality));
  }
  if (config.faithfulness !== undefined) {
    gates.push(createFaithfulnessGate(config.faithfulness));
  }
  if (config.relevance !== undefined) {
    gates.push(createRelevanceGate(config.relevance));
  }
  if (config.toolCorrectness !== undefined) {
    gates.push(createToolCorrectnessGate(config.toolCorrectness));
  }
  if (config.costPerTask !== undefined) {
    gates.push(createCostGate(config.costPerTask));
  }
  if (config.latencyP99 !== undefined) {
    gates.push(createLatencyGate(config.latencyP99));
  }
  if (config.passRate !== undefined) {
    gates.push(createPassRateGate(config.passRate));
  }
  if (config.maxSLAViolations !== undefined) {
    gates.push(createSLAViolationsGate(config.maxSLAViolations));
  }

  return gates;
}
