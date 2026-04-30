/**
 * agent-eval-harness — End-to-end agent evaluation harness
 *
 * Supports trajectory evaluation, tool-use correctness validation,
 * cost-per-task tracking, latency budget enforcement, regression
 * suites with golden trajectories, and LLM-as-judge with calibration.
 */

// Core types
export * from './types/index.js';

// Trajectory evaluation
export {
  parseTurn,
  loadFromContent,
  loadFromFile,
  loadFromDirectory,
  serializeToJsonl,
  saveToFile,
} from './trajectory/loader.js';
export type { TrajectoryLoadError } from './trajectory/loader.js';
export {
  evaluate,
  analyzeCoherence,
  analyzeGoalCompletion,
  analyzeConversationFlow,
} from './trajectory/evaluator.js';
export { compare } from './trajectory/comparator.js';

// Tool-use validation
export { validateTrajectory, validateTurn, validateToolCall } from './tool-use/validator.js';
export { validateSchema, createToolSchema } from './tool-use/schema-checker.js';
export {
  verifyResult,
  verifyTurnResults,
  summarizeResultVerification,
} from './tool-use/result-verifier.js';

// Cost tracking
export {
  calculateTurnCost,
  calculateTrajectoryCost,
  compareCosts,
  getCostPerMetric,
  DEFAULT_PRICING,
} from './cost/tracker.js';
export type { ProviderPricing, CostOptions, TurnCost as TrackerTurnCost } from './cost/tracker.js';
export {
  checkBudget,
  getOptimizationRecommendations,
  createBudget,
  CostTracker,
} from './cost/budget-manager.js';
export type { BudgetConfig, BudgetCheckResult, BudgetAlert } from './cost/budget-manager.js';
export {
  generateCostReport,
  formatCost,
  exportToCsv,
  exportToJson,
  generateSummary,
} from './cost/reporter.js';

// Latency monitoring
export {
  monitorLatency,
  getComponentBreakdown,
  compareLatency,
  detectAnomalies,
} from './latency/monitor.js';
export { enforceBudget, createLatencyBudget, formatLatency } from './latency/budget-enforcer.js';
export { analyzeOptimization, LatencyTracker } from './latency/optimizer.js';

// LLM Judge
export { JudgeEngine } from './judge/engine.js';
export type { JudgeConfig, JudgeRequest } from './judge/engine.js';
export { JudgeCalibrator, ConsensusEngine } from './judge/calibration.js';
export {
  getFaithfulnessTemplate,
  getRelevanceTemplate,
  getToolCorrectnessTemplate,
  getOverallQualityTemplate,
  buildPrompt,
  getAvailableTemplates,
  createCustomTemplate,
} from './judge/prompts.js';
export { JudgeCostTracker } from './judge/cost-tracker.js';

// Golden trajectories
export {
  loadGoldenTrajectories,
  validateGolden,
  goldenToJSONL,
  createGolden,
  updateGolden,
  filterByTags,
  getByScenario,
} from './golden/manager.js';
export { compareAgainstGolden, batchCompare, findBestGolden } from './golden/comparator.js';
export {
  GoldenCurator,
  createCurator,
  quickCreateGolden,
  batchQualityCheck,
  generateCurationReport,
} from './golden/curator.js';

// Evaluation suite
export { SuiteRunner, createSuiteRunner } from './suite/runner.js';
export type { EvalRunResult, OverallMetrics, SuiteRunnerConfig } from './suite/runner.js';
export {
  parseConfig,
  validateConfig,
  createDefaultConfig,
  mergeConfig,
  calculateOverallScore,
  checkThresholds,
} from './suite/config.js';
export type { SuiteConfig } from './suite/config.js';
export { ResultsAggregator, createResultsAggregator } from './suite/results.js';
export type { AggregatedResults } from './suite/results.js';
export { RunComparator, createRunComparator } from './suite/comparator.js';

// CI Gates
export { GateEngine, createGateEngine } from './gate/engine.js';
export {
  createOverallQualityGate,
  createFaithfulnessGate,
  createRelevanceGate,
  createToolCorrectnessGate,
  createCostGate,
  createLatencyGate,
  createPassRateGate,
  createSLAViolationsGate,
  getStandardPreset,
  getStrictPreset,
  getLenientPreset,
  buildThresholdGates,
} from './gate/threshold-gates.js';
export {
  createNoRegressionGate,
  createImprovementGate,
  createSignificanceGate,
  createMetricRegressionGate,
} from './gate/baseline-gates.js';
export {
  CIIntegration,
  writeJUnitReport,
  outputGitHubAnnotations,
  setGitHubOutput,
  exportForCI,
} from './gate/ci-integration.js';

// MCP Server
export { EvalHarnessMCPServer, createMCPServer } from './mcp-server/mcp-server.js';
export type { MCPServerConfig } from './mcp-server/mcp-server.js';

// Observability
export { getTracingManager, withTracing, addSpanAttributes } from './observability/tracing.js';
export type { TracingConfig } from './observability/tracing.js';
export { getMetricsManager, recordMetric, incrementCounter } from './observability/metrics.js';
export type { MetricsConfig } from './observability/metrics.js';
export {
  getLogger,
  createChildLogger,
  setGlobalRunId,
  getGlobalRunId,
} from './observability/logger.js';
export type { LoggerConfig } from './observability/logger.js';
export { getDashboardManager } from './observability/dashboard.js';
export type { DashboardConfig } from './observability/dashboard.js';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const VERSION: string = require('../package.json').version;

/**
 * Main entry point - returns library info
 */
export function getLibraryInfo(): {
  name: string;
  version: string;
  description: string;
} {
  return {
    name: '@reaatech/agent-eval-harness',
    version: VERSION,
    description: 'End-to-end agent evaluation harness for full agent runs',
  };
}
