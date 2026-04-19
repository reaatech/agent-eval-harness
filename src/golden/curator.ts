import type { Trajectory } from '../types/domain.js';
import type { GoldenTrajectory, GoldenMetadata } from './manager.js';
import { validateGolden, goldenToJSONL } from './manager.js';

/**
 * Curation workflow state
 */
export interface CurationState {
  /** Current step */
  step: 'identify' | 'annotate' | 'validate' | 'publish';
  /** Trajectory being curated */
  trajectory: Trajectory;
  /** Draft golden metadata */
  draftMetadata: Partial<GoldenMetadata>;
  /** Annotations added */
  annotations: TurnAnnotation[];
  /** Validation results */
  validationResults?: Awaited<ReturnType<typeof validateGolden>>;
}

/**
 * Turn annotation
 */
export interface TurnAnnotation {
  turnId: number;
  /** Whether this turn is expected */
  expected: boolean;
  /** Quality notes for this turn */
  qualityNotes?: string;
  /** Alternative acceptable responses */
  alternatives?: string[];
}

/**
 * Quality check result
 */
export interface QualityCheckResult {
  passed: boolean;
  score: number;
  issues: QualityIssue[];
  suggestions: string[];
}

/**
 * Quality issue
 */
export interface QualityIssue {
  type: 'incomplete' | 'ambiguous' | 'incorrect' | 'suboptimal';
  severity: 'low' | 'medium' | 'high';
  turnId: number;
  description: string;
}

/**
 * Golden Data Curator
 */
export class GoldenCurator {
  private state: CurationState;

  constructor(trajectory: Trajectory) {
    this.state = {
      step: 'identify',
      trajectory,
      draftMetadata: {},
      annotations: [],
    };
  }

  /**
   * Start curation workflow
   */
  start(metadata: Partial<GoldenMetadata>): CurationState {
    this.state.draftMetadata = metadata;
    this.state.step = 'annotate';
    return this.state;
  }

  /**
   * Annotate a turn
   */
  annotateTurn(annotation: TurnAnnotation): CurationState {
    // Remove existing annotation for this turn if present
    this.state.annotations = this.state.annotations.filter((a) => a.turnId !== annotation.turnId);
    this.state.annotations.push(annotation);

    return this.state;
  }

  /**
   * Auto-annotate all agent turns as expected
   */
  autoAnnotate(): CurationState {
    const agentTurns = this.state.trajectory.turns.filter((t) => t.role === 'agent');

    for (const turn of agentTurns) {
      this.annotateTurn({
        turnId: turn.turn_id,
        expected: true,
        qualityNotes: 'Auto-annotated as expected',
      });
    }

    return this.state;
  }

  /**
   * Run quality checks
   */
  runQualityChecks(): QualityCheckResult {
    const issues: QualityIssue[] = [];
    const suggestions: string[] = [];
    let score = 100;

    const agentTurns = this.state.trajectory.turns.filter((t) => t.role === 'agent');

    // Check for empty content
    for (const turn of agentTurns) {
      if (!turn.content && (!turn.tool_calls || turn.tool_calls.length === 0)) {
        issues.push({
          type: 'incomplete',
          severity: 'high',
          turnId: turn.turn_id,
          description: `Turn ${turn.turn_id} has no content or tool calls`,
        });
        score -= 20;
      }
    }

    // Check for very short responses
    for (const turn of agentTurns) {
      if (turn.content && turn.content.length < 5) {
        issues.push({
          type: 'incomplete',
          severity: 'low',
          turnId: turn.turn_id,
          description: `Turn ${turn.turn_id} has very short content`,
        });
        score -= 5;
      }
    }

    // Check annotation coverage
    const annotatedTurns = this.state.annotations.length;
    const annotationCoverage = agentTurns.length > 0 ? annotatedTurns / agentTurns.length : 0;

    if (annotationCoverage < 0.5) {
      suggestions.push('Add annotations for more agent turns');
      score -= 15;
    }

    // Check metadata completeness
    if (!this.state.draftMetadata.description) {
      suggestions.push('Add a description for the scenario');
      score -= 10;
    }

    if (!this.state.draftMetadata.tags || this.state.draftMetadata.tags.length === 0) {
      suggestions.push('Add tags for categorization');
      score -= 5;
    }

    return {
      passed: issues.filter((i) => i.severity === 'high').length === 0,
      score: Math.max(0, score),
      issues,
      suggestions,
    };
  }

  /**
   * Validate the golden trajectory
   */
  validate(): CurationState {
    const golden = this.buildGolden();
    this.state.validationResults = validateGolden(golden);
    this.state.step = 'validate';
    return this.state;
  }

  /**
   * Publish the golden trajectory
   */
  publish(): GoldenTrajectory {
    if (!this.state.validationResults?.valid) {
      throw new Error('Cannot publish invalid golden trajectory');
    }

    const golden = this.buildGolden();
    this.state.step = 'publish';
    return golden;
  }

  /**
   * Build golden trajectory from state
   */
  private buildGolden(): GoldenTrajectory {
    // Apply annotations to trajectory
    const markedTurns = this.state.trajectory.turns.map((turn) => {
      const annotation = this.state.annotations.find((a) => a.turnId === turn.turn_id);

      return {
        ...turn,
        golden: true,
        expected: annotation?.expected || turn.role === 'agent',
        ...(annotation?.qualityNotes != null && { quality_notes: annotation.qualityNotes }),
      };
    });

    return {
      id: this.state.draftMetadata.tags?.join('-') || `golden-${Date.now()}`,
      metadata: {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        description: this.state.draftMetadata.description || '',
        tags: this.state.draftMetadata.tags || [],
        ...(this.state.draftMetadata.qualityNotes != null && {
          qualityNotes: this.state.draftMetadata.qualityNotes,
        }),
        ...(this.state.draftMetadata.expectedOutcomes != null && {
          expectedOutcomes: this.state.draftMetadata.expectedOutcomes,
        }),
      },
      trajectory: {
        ...this.state.trajectory,
        turns: markedTurns,
      },
    };
  }

  /**
   * Get current state
   */
  getState(): CurationState {
    return { ...this.state };
  }

  /**
   * Export as JSONL
   */
  exportJSONL(): string {
    const golden = this.buildGolden();
    return goldenToJSONL(golden);
  }
}

/**
 * Create a curator for a trajectory
 */
export function createCurator(trajectory: Trajectory): GoldenCurator {
  return new GoldenCurator(trajectory);
}

/**
 * Quick create golden from trajectory
 */
export function quickCreateGolden(
  trajectory: Trajectory,
  description: string,
  tags: string[],
): GoldenTrajectory {
  const curator = createCurator(trajectory);
  curator.start({ description, tags });
  curator.autoAnnotate();
  curator.validate();
  return curator.publish();
}

/**
 * Batch quality check for multiple golden trajectories
 */
export function batchQualityCheck(goldens: GoldenTrajectory[]): Array<{
  id: string;
  result: QualityCheckResult;
}> {
  return goldens.map((golden) => {
    const curator = createCurator(golden.trajectory);
    curator.start(golden.metadata);
    const result = curator.runQualityChecks();

    return {
      id: golden.id,
      result,
    };
  });
}

/**
 * Generate curation report
 */
export function generateCurationReport(goldens: GoldenTrajectory[]): string {
  const lines: string[] = [
    '=== Golden Trajectory Curation Report ===',
    `Total trajectories: ${goldens.length}`,
    '',
  ];

  const qualityChecks = batchQualityCheck(goldens);

  for (const { id, result } of qualityChecks) {
    lines.push(`Golden: ${id}`);
    lines.push(`  Score: ${result.score}/100`);
    lines.push(`  Passed: ${result.passed ? 'Yes' : 'No'}`);

    if (result.issues.length > 0) {
      lines.push('  Issues:');
      for (const issue of result.issues) {
        lines.push(`    - [${issue.severity}] ${issue.description}`);
      }
    }

    if (result.suggestions.length > 0) {
      lines.push('  Suggestions:');
      for (const suggestion of result.suggestions) {
        lines.push(`    - ${suggestion}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}
