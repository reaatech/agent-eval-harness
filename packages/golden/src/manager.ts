import type { Trajectory, Turn } from '@reaatech/agent-eval-harness-types';

/**
 * Golden trajectory metadata
 */
export interface GoldenMetadata {
  /** Golden trajectory version */
  version: string;
  /** Creation timestamp */
  createdAt: string;
  /** Last updated timestamp */
  updatedAt: string;
  /** Description of the scenario */
  description: string;
  /** Tags for categorization */
  tags: string[];
  /** Quality notes */
  qualityNotes?: string;
  /** Expected outcomes */
  expectedOutcomes?: string[];
}

/**
 * Golden trajectory with metadata
 */
export interface GoldenTrajectory {
  /** Unique identifier */
  id: string;
  /** Golden metadata */
  metadata: GoldenMetadata;
  /** The reference trajectory */
  trajectory: Trajectory;
}

/**
 * Version history entry
 */
export interface VersionEntry {
  version: string;
  timestamp: string;
  changes: string;
  trajectoryPath: string;
}

/**
 * Golden trajectory validation result
 */
export interface GoldenValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  score: number;
}

/**
 * Load golden trajectories from JSONL
 */
export function loadGoldenTrajectories(jsonlContent: string): GoldenTrajectory[] {
  const lines = jsonlContent.trim().split('\n');
  const trajectories: GoldenTrajectory[] = [];
  let currentTurns: Turn[] = [];
  let currentMetadata: Partial<GoldenMetadata> = {};
  let currentId = '';

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    if (!line) continue;
    if (!line.trim()) continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      throw new Error(`Invalid JSON at line ${lineIdx + 1}: ${(err as Error).message}`, {
        cause: err,
      });
    }

    // Check if this is a metadata line
    if (parsed._golden_metadata) {
      // Save previous trajectory if exists
      if (currentId && currentTurns.length > 0) {
        const firstTs = currentTurns[0]?.timestamp;
        const lastTs = currentTurns[currentTurns.length - 1]?.timestamp;
        trajectories.push({
          id: currentId,
          metadata: {
            version: currentMetadata.version || '1.0.0',
            createdAt: currentMetadata.createdAt || new Date().toISOString(),
            updatedAt: currentMetadata.updatedAt || new Date().toISOString(),
            description: currentMetadata.description || '',
            tags: currentMetadata.tags || [],
            ...(currentMetadata.qualityNotes != null && {
              qualityNotes: currentMetadata.qualityNotes,
            }),
            ...(currentMetadata.expectedOutcomes != null && {
              expectedOutcomes: currentMetadata.expectedOutcomes,
            }),
          },
          trajectory: {
            trajectory_id: currentId,
            turns: currentTurns,
            metadata: {
              ...(firstTs != null && { start_time: firstTs }),
              ...(lastTs != null && { end_time: lastTs }),
            },
          },
        });
      }

      currentId = (parsed._golden_metadata as Record<string, string>).id || `golden-${Date.now()}`;
      currentMetadata = parsed._golden_metadata;
      currentTurns = [];
      continue;
    }

    // This is a turn
    const turn = parsed as unknown as Turn;
    const turnObj: Turn = {
      turn_id: turn.turn_id,
      role: turn.role,
      content: turn.content,
      timestamp: turn.timestamp,
      ...(turn.tool_calls ? { tool_calls: turn.tool_calls } : {}),
      ...(turn.latency_ms ? { latency_ms: turn.latency_ms } : {}),
      ...(turn.cost ? { cost: turn.cost } : {}),
      ...(turn.golden ? { golden: turn.golden } : {}),
      ...(turn.golden && turn.expected ? { expected: turn.expected } : {}),
    };
    currentTurns.push(turnObj);
  }

  // Don't forget the last trajectory
  if (currentId && currentTurns.length > 0) {
    const firstTs = currentTurns[0]?.timestamp;
    const lastTs = currentTurns[currentTurns.length - 1]?.timestamp;
    trajectories.push({
      id: currentId,
      metadata: {
        version: currentMetadata.version || '1.0.0',
        createdAt: currentMetadata.createdAt || new Date().toISOString(),
        updatedAt: currentMetadata.updatedAt || new Date().toISOString(),
        description: currentMetadata.description || '',
        tags: currentMetadata.tags || [],
        ...(currentMetadata.qualityNotes != null && { qualityNotes: currentMetadata.qualityNotes }),
        ...(currentMetadata.expectedOutcomes != null && {
          expectedOutcomes: currentMetadata.expectedOutcomes,
        }),
      },
      trajectory: {
        trajectory_id: currentId,
        turns: currentTurns,
        metadata: {
          ...(firstTs != null && { start_time: firstTs }),
          ...(lastTs != null && { end_time: lastTs }),
        },
      },
    });
  }

  return trajectories;
}

/**
 * Validate a golden trajectory
 */
export function validateGolden(golden: GoldenTrajectory): GoldenValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required metadata
  if (!golden.metadata.description) {
    warnings.push('Missing description');
  }

  if (golden.metadata.tags.length === 0) {
    warnings.push('No tags specified');
  }

  // Check trajectory structure
  if (golden.trajectory.turns.length === 0) {
    errors.push('Trajectory has no turns');
  }

  // Check that trajectory starts with user
  if (golden.trajectory.turns[0]?.role !== 'user') {
    errors.push('Trajectory should start with a user turn');
  }

  // Check turn sequence
  let lastRole = '';
  for (const turn of golden.trajectory.turns) {
    if (turn.role === lastRole) {
      warnings.push(`Consecutive ${lastRole} turns detected at turn ${turn.turn_id}`);
    }
    lastRole = turn.role;

    if (!turn.content && (!turn.tool_calls || turn.tool_calls.length === 0)) {
      warnings.push(`Turn ${turn.turn_id} has no content or tool calls`);
    }
  }

  // Check for expected annotations
  const agentTurns = golden.trajectory.turns.filter((t) => t.role === 'agent');
  const expectedTurns = agentTurns.filter((t) => t.expected === true);

  if (expectedTurns.length === 0) {
    warnings.push('No turns marked as expected');
  }

  const valid = errors.length === 0;
  const score = calculateValidationScore(golden, errors, warnings);

  return { valid, errors, warnings, score };
}

/**
 * Calculate validation score
 */
function calculateValidationScore(
  golden: GoldenTrajectory,
  errors: string[],
  warnings: string[],
): number {
  if (errors.length > 0) return 0;

  let score = 1.0;
  score -= warnings.length * 0.05;

  // Bonus for good documentation
  if (golden.metadata.description && golden.metadata.tags.length > 0) {
    score += 0.05;
  }

  // Bonus for expected annotations
  const agentTurns = golden.trajectory.turns.filter((t) => t.role === 'agent');
  const expectedRatio = agentTurns.filter((t) => t.expected === true).length / agentTurns.length;
  score += expectedRatio * 0.05;

  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}

/**
 * Convert golden trajectory to JSONL
 */
export function goldenToJSONL(golden: GoldenTrajectory): string {
  const lines: string[] = [];

  // Metadata line
  lines.push(
    JSON.stringify({
      _golden_metadata: {
        id: golden.id,
        version: golden.metadata.version,
        createdAt: golden.metadata.createdAt,
        updatedAt: golden.metadata.updatedAt,
        description: golden.metadata.description,
        tags: golden.metadata.tags,
        qualityNotes: golden.metadata.qualityNotes,
        expectedOutcomes: golden.metadata.expectedOutcomes,
      },
    }),
  );

  // Turn lines
  for (const turn of golden.trajectory.turns) {
    lines.push(
      JSON.stringify({
        turn_id: turn.turn_id,
        role: turn.role,
        content: turn.content,
        timestamp: turn.timestamp,
        tool_calls: turn.tool_calls,
        latency_ms: turn.latency_ms,
        cost: turn.cost,
        golden: true,
        expected: turn.expected,
      }),
    );
  }

  return lines.join('\n');
}

/**
 * Create a new golden trajectory
 */
export function createGolden(
  trajectory: Trajectory,
  options: Partial<GoldenMetadata>,
): GoldenTrajectory {
  const now = new Date().toISOString();
  const id = options.tags?.join('-') || `golden-${Date.now()}`;

  // Mark agent turns as expected
  const markedTurns = trajectory.turns.map((turn) => ({
    ...turn,
    golden: true as const,
    expected: turn.role === 'agent',
  }));

  return {
    id,
    metadata: {
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
      description: options.description || '',
      tags: options.tags || [],
      ...(options.qualityNotes != null && { qualityNotes: options.qualityNotes }),
      ...(options.expectedOutcomes != null && { expectedOutcomes: options.expectedOutcomes }),
    },
    trajectory: {
      ...trajectory,
      turns: markedTurns,
    },
  };
}

/**
 * Update golden trajectory version
 */
export function updateGolden(
  golden: GoldenTrajectory,
  changes: Partial<GoldenMetadata>,
): GoldenTrajectory {
  return {
    ...golden,
    metadata: {
      ...golden.metadata,
      ...changes,
      updatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Filter golden trajectories by tags
 */
export function filterByTags(goldens: GoldenTrajectory[], tags: string[]): GoldenTrajectory[] {
  return goldens.filter((g) => tags.some((tag) => g.metadata.tags.includes(tag)));
}

/**
 * Get golden trajectories by scenario
 */
export function getByScenario(goldens: GoldenTrajectory[], scenario: string): GoldenTrajectory[] {
  return goldens.filter(
    (g) =>
      g.metadata.description.toLowerCase().includes(scenario.toLowerCase()) ||
      g.trajectory.trajectory_id?.toLowerCase().includes(scenario.toLowerCase()),
  );
}
