import type { Trajectory, Turn, GoldenTrajectory } from '../types/domain.js';

/**
 * Comparison result between a trajectory and a golden reference
 */
export interface ComparisonResult {
  /** Overall similarity score (0.0 to 1.0) */
  similarity: number;
  /** Whether the trajectory passes the similarity threshold */
  passed: boolean;
  /** Detailed diff between trajectories */
  diff: TrajectoryDiff;
  /** Regressions detected */
  regressions: Regression[];
  /** Improvements detected */
  improvements: Improvement[];
  /** Per-turn comparison results */
  turnComparisons: TurnComparison[];
}

/**
 * Detailed diff between two trajectories
 */
export interface TrajectoryDiff {
  /** Turns present in golden but missing in candidate */
  missingTurns: number[];
  /** Turns present in candidate but not in golden */
  extraTurns: number[];
  /** Turns with different content */
  modifiedTurns: TurnDiff[];
  /** Tool call differences */
  toolDifferences: ToolDiff[];
}

/**
 * Difference in a single turn
 */
export interface TurnDiff {
  turnId: number;
  field: string;
  expected: unknown;
  actual: unknown;
  similarity: number;
}

/**
 * Tool call difference
 */
export interface ToolDiff {
  turnId: number;
  expectedTool?: string;
  actualTool?: string;
  argumentDifferences: ArgumentDiff[];
}

/**
 * Argument difference
 */
export interface ArgumentDiff {
  argument: string;
  expected: unknown;
  actual: unknown;
}

/**
 * Regression detected
 */
export interface Regression {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  turnId?: number;
  impact: number;
}

/**
 * Improvement detected
 */
export interface Improvement {
  type: string;
  description: string;
  turnId?: number;
  benefit: number;
}

/**
 * Per-turn comparison result
 */
export interface TurnComparison {
  turnId: number;
  similarity: number;
  matches: boolean;
  differences: TurnDiff[];
}

/**
 * Options for trajectory comparison
 */
export interface CompareOptions {
  /** Similarity threshold for passing (0.0 to 1.0) */
  similarityThreshold?: number;
  /** Whether to compare tool calls */
  compareTools?: boolean;
  /** Whether to compare latency */
  compareLatency?: boolean;
  /** Whether to compare costs */
  compareCosts?: boolean;
  /** Strict mode - require exact matches */
  strict?: boolean;
}

/**
 * Compare a trajectory against a golden reference
 */
export function compare(
  candidate: Trajectory,
  golden: GoldenTrajectory | Trajectory,
  options: CompareOptions = {},
): ComparisonResult {
  const { similarityThreshold = 0.85 } = options;

  const goldenTurns = 'trajectory' in golden ? golden.trajectory.turns : golden.turns;
  const candidateTurns = candidate.turns;

  // Compare turns
  const turnComparisons = compareTurns(candidateTurns, goldenTurns, options);

  // Calculate overall similarity
  const similarity = calculateOverallSimilarity(turnComparisons);

  // Generate diff
  const diff = generateDiff(candidateTurns, goldenTurns, turnComparisons);

  // Detect regressions
  const regressions = detectRegressions(candidateTurns, goldenTurns, turnComparisons, diff);

  // Detect improvements
  const improvements = detectImprovements(candidateTurns, goldenTurns, turnComparisons);

  // Determine pass/fail
  const passed =
    similarity >= similarityThreshold &&
    regressions.filter((r) => r.severity === 'critical').length === 0;

  return {
    similarity: Math.round(similarity * 100) / 100,
    passed,
    diff,
    regressions,
    improvements,
    turnComparisons,
  };
}

/**
 * Compare individual turns
 */
function compareTurns(
  candidate: Turn[],
  golden: Turn[],
  options: CompareOptions,
): TurnComparison[] {
  const comparisons: TurnComparison[] = [];
  const maxLen = Math.max(candidate.length, golden.length);

  for (let i = 0; i < maxLen; i++) {
    const goldenTurn = golden[i];
    const candidateTurn = candidate[i];

    if (!goldenTurn) {
      if (!candidateTurn) continue;
      comparisons.push({
        turnId: candidateTurn.turn_id,
        similarity: 0,
        matches: false,
        differences: [
          {
            turnId: candidateTurn.turn_id,
            field: 'turn',
            expected: undefined,
            actual: candidateTurn,
            similarity: 0,
          },
        ],
      });
      continue;
    }

    if (!candidateTurn) {
      comparisons.push({
        turnId: goldenTurn.turn_id,
        similarity: 0,
        matches: false,
        differences: [
          {
            turnId: goldenTurn.turn_id,
            field: 'turn',
            expected: goldenTurn,
            actual: undefined,
            similarity: 0,
          },
        ],
      });
      continue;
    }

    const differences = compareTurnContent(candidateTurn, goldenTurn, options);
    const similarity = differences.length === 0 ? 1 : 1 - differences.length * 0.1;

    comparisons.push({
      turnId: candidateTurn.turn_id,
      similarity: Math.max(0, Math.round(similarity * 100) / 100),
      matches: differences.length === 0 || similarity >= 0.9,
      differences,
    });
  }

  return comparisons;
}

/**
 * Compare content of two turns
 */
function compareTurnContent(candidate: Turn, golden: Turn, options: CompareOptions): TurnDiff[] {
  const differences: TurnDiff[] = [];

  if (candidate.content !== golden.content) {
    const contentSimilarity = stringSimilarity(candidate.content, golden.content);
    if (contentSimilarity < 0.9) {
      differences.push({
        turnId: candidate.turn_id,
        field: 'content',
        expected: golden.content,
        actual: candidate.content,
        similarity: contentSimilarity,
      });
    }
  }

  if (candidate.role !== golden.role) {
    differences.push({
      turnId: candidate.turn_id,
      field: 'role',
      expected: golden.role,
      actual: candidate.role,
      similarity: 0,
    });
  }

  if (options.compareTools !== false) {
    const toolDiffs = compareToolCalls(candidate, golden);
    differences.push(...toolDiffs);
  }

  return differences;
}

/**
 * Compare tool calls between turns
 */
function compareToolCalls(candidate: Turn, golden: Turn): TurnDiff[] {
  const differences: TurnDiff[] = [];

  const candidateTools = candidate.tool_calls || [];
  const goldenTools = golden.tool_calls || [];

  if (candidateTools.length !== goldenTools.length) {
    differences.push({
      turnId: candidate.turn_id,
      field: 'tool_calls',
      expected: goldenTools.length,
      actual: candidateTools.length,
      similarity:
        Math.min(candidateTools.length, goldenTools.length) /
        Math.max(candidateTools.length, goldenTools.length),
    });
  }

  for (let i = 0; i < Math.max(candidateTools.length, goldenTools.length); i++) {
    const gt = goldenTools[i];
    const ct = candidateTools[i];

    if (!gt) {
      differences.push({
        turnId: candidate.turn_id,
        field: `tool_calls[${i}].name`,
        expected: undefined,
        actual: ct?.name,
        similarity: 0,
      });
      continue;
    }

    if (!ct) {
      differences.push({
        turnId: candidate.turn_id,
        field: `tool_calls[${i}].name`,
        expected: gt.name,
        actual: undefined,
        similarity: 0,
      });
      continue;
    }

    if (ct.name !== gt.name) {
      differences.push({
        turnId: candidate.turn_id,
        field: `tool_calls[${i}].name`,
        expected: gt.name,
        actual: ct.name,
        similarity: 0,
      });
    }

    for (const key of Object.keys(gt.arguments)) {
      if (JSON.stringify(ct.arguments[key]) !== JSON.stringify(gt.arguments[key])) {
        differences.push({
          turnId: candidate.turn_id,
          field: `tool_calls[${i}].arguments.${key}`,
          expected: gt.arguments[key],
          actual: ct.arguments[key],
          similarity: 0.5,
        });
      }
    }
  }

  return differences;
}

/**
 * Calculate overall similarity from turn comparisons
 */
function calculateOverallSimilarity(comparisons: TurnComparison[]): number {
  if (comparisons.length === 0) return 0;

  const totalSimilarity = comparisons.reduce((sum, c) => sum + c.similarity, 0);
  return totalSimilarity / comparisons.length;
}

/**
 * Generate detailed diff
 */
function generateDiff(
  candidate: Turn[],
  golden: Turn[],
  comparisons: TurnComparison[],
): TrajectoryDiff {
  const candidateIds = new Set(candidate.map((t) => t.turn_id));
  const goldenIds = new Set(golden.map((t) => t.turn_id));

  const missingTurns = [...goldenIds].filter((id) => !candidateIds.has(id));
  const extraTurns = [...candidateIds].filter((id) => !goldenIds.has(id));

  const modifiedTurns = comparisons
    .filter((c) => !c.matches && c.differences.length > 0)
    .flatMap((c) => c.differences) as TurnDiff[];

  const toolDifferences: ToolDiff[] = [];
  for (const diff of modifiedTurns) {
    if (diff.field.startsWith('tool_calls')) {
      const turnId = diff.turnId;
      let toolDiff = toolDifferences.find((td) => td.turnId === turnId);
      if (!toolDiff) {
        toolDiff = {
          turnId,
          argumentDifferences: [],
        };
        toolDifferences.push(toolDiff);
      }

      if (diff.field.includes('.name')) {
        toolDiff.expectedTool = diff.expected as string;
        toolDiff.actualTool = diff.actual as string;
      } else if (diff.field.includes('.arguments.')) {
        const argName = diff.field.split('.arguments.')[1]!;
        toolDiff.argumentDifferences.push({
          argument: argName,
          expected: diff.expected,
          actual: diff.actual,
        });
      }
    }
  }

  return {
    missingTurns,
    extraTurns,
    modifiedTurns,
    toolDifferences,
  };
}

/**
 * Detect regressions
 */
function detectRegressions(
  _candidate: Turn[],
  _golden: Turn[],
  comparisons: TurnComparison[],
  diff: TrajectoryDiff,
): Regression[] {
  const regressions: Regression[] = [];

  // Missing turns are critical regressions
  for (const turnId of diff.missingTurns) {
    regressions.push({
      type: 'missing_turn',
      severity: 'critical',
      description: `Turn ${turnId} from golden trajectory is missing`,
      turnId,
      impact: 0.2,
    });
  }

  // Extra turns are minor regressions
  for (const turnId of diff.extraTurns) {
    regressions.push({
      type: 'extra_turn',
      severity: 'low',
      description: `Extra turn ${turnId} not in golden trajectory`,
      turnId,
      impact: 0.05,
    });
  }

  // Tool call differences
  for (const toolDiff of diff.toolDifferences) {
    if (toolDiff.expectedTool !== toolDiff.actualTool) {
      regressions.push({
        type: 'tool_mismatch',
        severity: 'high',
        description: `Turn ${toolDiff.turnId}: expected tool "${toolDiff.expectedTool}", got "${toolDiff.actualTool}"`,
        turnId: toolDiff.turnId,
        impact: 0.15,
      });
    }
  }

  // Low similarity turns
  for (const comp of comparisons) {
    if (comp.similarity < 0.7) {
      regressions.push({
        type: 'low_similarity',
        severity: comp.similarity < 0.5 ? 'high' : 'medium',
        description: `Turn ${comp.turnId} has low similarity (${comp.similarity}) to golden`,
        turnId: comp.turnId,
        impact: (1 - comp.similarity) * 0.1,
      });
    }
  }

  return regressions;
}

/**
 * Detect improvements
 */
function detectImprovements(
  candidate: Turn[],
  golden: Turn[],
  _comparisons: TurnComparison[],
): Improvement[] {
  const improvements: Improvement[] = [];

  // Check for turns where candidate is significantly better
  // (This is a simplified heuristic - in practice you'd need more sophisticated analysis)
  for (let i = 0; i < candidate.length; i++) {
    const candidateTurn = candidate[i];
    const goldenTurn = golden[i];

    if (!goldenTurn || !candidateTurn) continue;

    // Check if candidate has tool results while golden doesn't
    if (
      candidateTurn.tool_calls?.some((tc) => tc.result) &&
      !goldenTurn.tool_calls?.some((tc) => tc.result)
    ) {
      improvements.push({
        type: 'tool_result_added',
        description: `Turn ${candidateTurn.turn_id}: candidate includes tool results`,
        turnId: candidateTurn.turn_id,
        benefit: 0.1,
      });
    }

    // Check if candidate has latency data while golden doesn't
    if (candidateTurn.latency_ms && !goldenTurn.latency_ms) {
      improvements.push({
        type: 'latency_tracking_added',
        description: `Turn ${candidateTurn.turn_id}: candidate includes latency data`,
        turnId: candidateTurn.turn_id,
        benefit: 0.05,
      });
    }
  }

  return improvements;
}

/**
 * Calculate string similarity using Levenshtein distance
 */
function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const maxLen = Math.max(a.length, b.length);
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1,
          matrix[i]![j - 1]! + 1,
          matrix[i - 1]![j]! + 1,
        );
      }
    }
  }

  return matrix[b.length]![a.length]!;
}
