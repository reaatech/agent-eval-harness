import * as fs from 'node:fs/promises';
import * as path from 'path';
import type { Trajectory, Turn } from '../types/domain.js';
import { TrajectorySchema, TurnSchema } from '../types/schemas.js';
import { z } from 'zod';

/**
 * Error thrown when trajectory loading fails
 */
export class TrajectoryLoadError extends Error {
  constructor(
    message: string,
    public cause?: Error,
    public filePath?: string,
  ) {
    super(message);
    this.name = 'TrajectoryLoadError';
  }
}

/**
 * Options for trajectory loading
 */
export interface LoadOptions {
  /** Validate trajectory structure */
  validate?: boolean;
  /** Generate trajectory_id if missing */
  generateId?: boolean;
}

/**
 * Parse a single JSONL line into a Turn
 */
export function parseTurn(line: string, lineNumber: number): Turn {
  try {
    const parsed = JSON.parse(line);
    const validated = TurnSchema.parse(parsed);
    return validated as Turn;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new TrajectoryLoadError(
        `Invalid turn at line ${lineNumber}: ${issues}`,
        error,
        undefined,
      );
    }
    if (error instanceof SyntaxError) {
      throw new TrajectoryLoadError(
        `Invalid JSON at line ${lineNumber}: ${error.message}`,
        error,
        undefined,
      );
    }
    throw error;
  }
}

/**
 * Load trajectory from JSONL content string
 */
export function loadFromContent(content: string, options: LoadOptions = {}): Trajectory {
  const { validate = true, generateId = true } = options;

  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  if (lines.length === 0) {
    throw new TrajectoryLoadError('Trajectory file is empty');
  }

  const turns: Turn[] = lines.map((line, index) => parseTurn(line, index + 1));

  validateTurnSequence(turns);

  const metadata = computeMetadata(turns);

  let trajectoryId: string | undefined;
  if (generateId) {
    trajectoryId = `traj_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  const trajectory: Trajectory = {
    turns,
    metadata,
    ...(trajectoryId != null && { trajectory_id: trajectoryId }),
  };

  if (validate) {
    try {
      TrajectorySchema.parse(trajectory);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
        throw new TrajectoryLoadError(`Trajectory validation failed: ${issues}`, error);
      }
      throw error;
    }
  }

  return trajectory;
}

/**
 * Load trajectory from a JSONL file
 */
export async function loadFromFile(
  filePath: string,
  options: LoadOptions = {},
): Promise<Trajectory> {
  const absolutePath = path.resolve(filePath);

  try {
    await fs.access(absolutePath);
  } catch {
    throw new TrajectoryLoadError(
      `Trajectory file not found: ${absolutePath}`,
      undefined,
      absolutePath,
    );
  }

  let content: string;
  try {
    content = await fs.readFile(absolutePath, 'utf-8');
  } catch (error) {
    throw new TrajectoryLoadError(
      `Failed to read trajectory file: ${absolutePath}`,
      error as Error,
      absolutePath,
    );
  }

  return loadFromContent(content, options);
}

/**
 * Load multiple trajectories from a directory
 */
export async function loadFromDirectory(
  dirPath: string,
  options: LoadOptions = {},
): Promise<Trajectory[]> {
  const absolutePath = path.resolve(dirPath);

  try {
    await fs.access(absolutePath);
  } catch {
    throw new TrajectoryLoadError(`Directory not found: ${absolutePath}`, undefined, absolutePath);
  }

  const entries = await fs.readdir(absolutePath);
  const files = entries
    .filter((file) => file.endsWith('.jsonl'))
    .map((file) => path.join(absolutePath, file));

  const trajectories: Trajectory[] = [];
  const errors: { file: string; error: Error }[] = [];

  for (const file of files) {
    try {
      trajectories.push(await loadFromFile(file, options));
    } catch (error) {
      errors.push({ file, error: error as Error });
    }
  }

  if (errors.length > 0 && trajectories.length === 0) {
    throw new TrajectoryLoadError(
      `Failed to load any trajectories from ${dirPath}:\n${errors
        .map((e) => `  ${e.file}: ${e.error.message}`)
        .join('\n')}`,
    );
  }

  return trajectories;
}

/**
 * Validate turn sequence integrity
 */
function validateTurnSequence(turns: Turn[]): void {
  for (const turn of turns) {
    if (turn.role === 'agent' && turn.tool_calls === undefined) {
      throw new TrajectoryLoadError(`Agent turn ${turn.turn_id} missing tool_calls field`);
    }
  }

  for (let i = 1; i < turns.length; i++) {
    const prev = turns[i - 1]!;
    const curr = turns[i]!;
    if (prev.turn_id === curr.turn_id && prev.role === curr.role) {
      throw new TrajectoryLoadError(
        `Consecutive ${prev.role} turns with same turn_id: ${curr.turn_id}`,
      );
    }
  }
}

/**
 * Compute trajectory metadata from turns
 */
function computeMetadata(turns: Turn[]): NonNullable<Trajectory['metadata']> {
  const totalCost = turns.reduce((sum, t) => {
    if (t.cost) {
      return sum + (t.cost.total_cost ?? 0);
    }
    return sum;
  }, 0);

  const startTime = turns[0]?.timestamp;
  const endTime = turns[turns.length - 1]?.timestamp;

  return {
    ...(startTime != null && { start_time: startTime }),
    ...(endTime != null && { end_time: endTime }),
    ...(totalCost > 0 && { total_cost: totalCost }),
    total_turns: turns.length,
  };
}

/**
 * Serialize trajectory to JSONL format
 */
export function serializeToJsonl(trajectory: Trajectory): string {
  return trajectory.turns.map((turn) => JSON.stringify(turn)).join('\n');
}

/**
 * Save trajectory to a JSONL file
 */
export async function saveToFile(trajectory: Trajectory, filePath: string): Promise<void> {
  const content = serializeToJsonl(trajectory);
  await fs.writeFile(path.resolve(filePath), content, 'utf-8');
}
