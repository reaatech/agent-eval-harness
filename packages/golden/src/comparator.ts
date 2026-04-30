import type { Trajectory, Turn } from '@reaatech/agent-eval-harness-types';
import type { GoldenTrajectory } from './manager.js';

/**
 * Turn-level comparison result
 */
export interface TurnComparison {
  turnId: number;
  similarity: number;
  contentMatch: boolean;
  toolMatch: boolean;
  differences: string[];
}

/**
 * Trajectory comparison result
 */
export interface TrajectoryComparisonResult {
  /** Overall similarity score (0.0 to 1.0) */
  similarity: number;
  /** Turn-by-turn comparisons */
  turnComparisons: TurnComparison[];
  /** Number of matching turns */
  matchingTurns: number;
  /** Number of divergent turns */
  divergentTurns: number;
  /** Total turns compared */
  totalTurns: number;
  /** Whether trajectory passes similarity threshold */
  passesThreshold: boolean;
  /** Detected regressions */
  regressions: Regression[];
  /** Diff summary */
  diffSummary: string;
}

/**
 * Regression detection
 */
export interface Regression {
  type: 'tool_mismatch' | 'content_divergence' | 'missing_turn' | 'extra_turn';
  severity: 'low' | 'medium' | 'high';
  turnId: number;
  description: string;
  golden: unknown;
  candidate: unknown;
}

/**
 * Comparison configuration
 */
export interface ComparisonConfig {
  /** Similarity threshold for passing */
  similarityThreshold: number;
  /** Whether to compare tool calls */
  compareTools: boolean;
  /** Whether to use semantic similarity */
  semanticComparison: boolean;
  /** Turn matching strategy */
  turnMatching: 'sequential' | 'flexible';
}

/**
 * Default comparison configuration
 */
const DEFAULT_CONFIG: ComparisonConfig = {
  similarityThreshold: 0.85,
  compareTools: true,
  semanticComparison: false,
  turnMatching: 'sequential',
};

/**
 * Compare a candidate trajectory against a golden trajectory
 */
export function compareAgainstGolden(
  golden: GoldenTrajectory,
  candidate: Trajectory,
  config: Partial<ComparisonConfig> = {},
): TrajectoryComparisonResult {
  const effectiveConfig = { ...DEFAULT_CONFIG, ...config };

  const goldenAgentTurns = golden.trajectory.turns.filter((t) => t.role === 'agent');
  const candidateAgentTurns = candidate.turns.filter((t) => t.role === 'agent');

  const turnComparisons: TurnComparison[] = [];
  const regressions: Regression[] = [];

  const maxTurns = Math.max(goldenAgentTurns.length, candidateAgentTurns.length);

  for (let i = 0; i < maxTurns; i++) {
    const goldenTurn = goldenAgentTurns[i];
    const candidateTurn = candidateAgentTurns[i];

    if (!goldenTurn) {
      if (!candidateTurn) continue;
      regressions.push({
        type: 'extra_turn',
        severity: 'medium',
        turnId: candidateTurn.turn_id,
        description: `Extra turn ${candidateTurn.turn_id} not present in golden`,
        golden: null,
        candidate: candidateTurn.content,
      });
      continue;
    }

    if (!candidateTurn) {
      // Missing turn in candidate
      regressions.push({
        type: 'missing_turn',
        severity: 'high',
        turnId: goldenTurn.turn_id,
        description: `Missing turn ${goldenTurn.turn_id} present in golden`,
        golden: goldenTurn.content,
        candidate: null,
      });
      continue;
    }

    const comparison = compareTurns(goldenTurn, candidateTurn, effectiveConfig);
    turnComparisons.push(comparison);

    // Detect regressions
    if (!comparison.contentMatch) {
      regressions.push({
        type: 'content_divergence',
        severity: comparison.similarity > 0.5 ? 'medium' : 'high',
        turnId: goldenTurn.turn_id,
        description: `Content divergence at turn ${goldenTurn.turn_id}`,
        golden: goldenTurn.content,
        candidate: candidateTurn.content,
      });
    }

    if (comparison.toolMatch === false) {
      regressions.push({
        type: 'tool_mismatch',
        severity: 'high',
        turnId: goldenTurn.turn_id,
        description: `Tool mismatch at turn ${goldenTurn.turn_id}`,
        golden: goldenTurn.tool_calls,
        candidate: candidateTurn.tool_calls,
      });
    }
  }

  // Calculate overall similarity
  const similarities = turnComparisons.map((tc) => tc.similarity);
  const overallSimilarity =
    similarities.length > 0 ? similarities.reduce((a, b) => a + b, 0) / similarities.length : 0;

  const matchingTurns = turnComparisons.filter(
    (tc) => tc.contentMatch && tc.toolMatch !== false,
  ).length;
  const divergentTurns = turnComparisons.length - matchingTurns;

  return {
    similarity: Math.round(overallSimilarity * 1000) / 1000,
    turnComparisons,
    matchingTurns,
    divergentTurns,
    totalTurns: maxTurns,
    passesThreshold: overallSimilarity >= effectiveConfig.similarityThreshold,
    regressions,
    diffSummary: generateDiffSummary(turnComparisons, regressions),
  };
}

/**
 * Compare two turns
 */
function compareTurns(golden: Turn, candidate: Turn, config: ComparisonConfig): TurnComparison {
  const differences: string[] = [];

  // Compare content
  const contentSimilarity = calculateContentSimilarity(golden.content, candidate.content);
  const contentMatch = contentSimilarity >= 0.7;

  if (!contentMatch) {
    differences.push(`Content similarity: ${contentSimilarity.toFixed(2)}`);
  }

  // Compare tool calls
  let toolMatch = true;
  if (config.compareTools) {
    toolMatch = compareToolCalls(golden.tool_calls || [], candidate.tool_calls || []);
    if (!toolMatch) {
      differences.push('Tool calls do not match');
    }
  }

  let similarity = contentSimilarity;
  if (!toolMatch) {
    similarity = similarity * 0.5;
  }

  return {
    turnId: golden.turn_id,
    similarity: Math.round(similarity * 1000) / 1000,
    contentMatch,
    toolMatch,
    differences,
  };
}

/**
 * Calculate content similarity (simple text similarity)
 */
function calculateContentSimilarity(golden: string, candidate: string): number {
  if (!golden && !candidate) return 1.0;
  if (!golden || !candidate) return 0.0;

  // Normalize
  const g = golden.toLowerCase().trim();
  const c = candidate.toLowerCase().trim();

  // Exact match
  if (g === c) return 1.0;

  // Jaccard similarity on words
  const goldWords = new Set(g.split(/\s+/));
  const candWords = new Set(c.split(/\s+/));

  const intersection = [...goldWords].filter((w) => candWords.has(w)).length;
  const union = new Set([...goldWords, ...candWords]).size;

  return union > 0 ? intersection / union : 0;
}

/**
 * Compare tool calls
 */
function compareToolCalls(
  golden: Array<{ name: string; arguments?: Record<string, unknown> }>,
  candidate: Array<{ name: string; arguments?: Record<string, unknown> }>,
): boolean {
  if (golden.length !== candidate.length) return false;

  for (let i = 0; i < golden.length; i++) {
    const g = golden[i];
    const c = candidate[i];

    if (!g || !c) return false;

    if (g.name !== c.name) return false;

    // Compare arguments if both have them
    if (g.arguments && c.arguments) {
      const gKeys = Object.keys(g.arguments);
      const cKeys = Object.keys(c.arguments);

      if (gKeys.length !== cKeys.length) return false;

      for (const key of gKeys) {
        if (JSON.stringify(g.arguments[key]) !== JSON.stringify(c.arguments[key])) {
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * Generate diff summary
 */
function generateDiffSummary(turnComparisons: TurnComparison[], regressions: Regression[]): string {
  const lines: string[] = [];

  lines.push(`Compared ${turnComparisons.length} turns`);
  lines.push(
    `Similarity: ${turnComparisons.filter((tc) => tc.contentMatch).length}/${turnComparisons.length} turns matching`,
  );

  if (regressions.length > 0) {
    lines.push(`\nRegressions found: ${regressions.length}`);
    for (const reg of regressions.slice(0, 5)) {
      lines.push(`  - [${reg.severity}] Turn ${reg.turnId}: ${reg.description}`);
    }
  }

  return lines.join('\n');
}

/**
 * Batch compare multiple trajectories against golden
 */
export function batchCompare(
  golden: GoldenTrajectory,
  candidates: Trajectory[],
  config: Partial<ComparisonConfig> = {},
): Array<{ trajectory: Trajectory; result: TrajectoryComparisonResult }> {
  return candidates.map((candidate) => ({
    trajectory: candidate,
    result: compareAgainstGolden(golden, candidate, config),
  }));
}

/**
 * Find best matching golden for a trajectory
 */
export function findBestGolden(
  candidate: Trajectory,
  goldens: GoldenTrajectory[],
  config: Partial<ComparisonConfig> = {},
): { golden: GoldenTrajectory; result: TrajectoryComparisonResult } | null {
  if (goldens.length === 0) return null;

  let bestMatch: { golden: GoldenTrajectory; result: TrajectoryComparisonResult } | null = null;
  let bestSimilarity = 0;

  for (const golden of goldens) {
    const result = compareAgainstGolden(golden, candidate, config);
    if (result.similarity > bestSimilarity) {
      bestSimilarity = result.similarity;
      bestMatch = { golden, result };
    }
  }

  return bestMatch;
}
