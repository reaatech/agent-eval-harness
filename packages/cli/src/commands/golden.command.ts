import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { GoldenCurator } from '@reaatech/agent-eval-harness-golden';
import {
  createGolden,
  loadGoldenTrajectories,
  updateGolden,
  validateGolden,
} from '@reaatech/agent-eval-harness-golden';
import type { GoldenTrajectory as ManagerGoldenTrajectory } from '@reaatech/agent-eval-harness-golden';
import { loadFromFile, saveToFile } from '@reaatech/agent-eval-harness-trajectory';
import { cliError, cliOut, cliWarn } from '../output.js';

export interface GoldenOptions {
  list?: boolean;
  create?: string;
  update?: string;
  delete?: string;
  validate?: string;
  dir?: string;
  verbose?: boolean;
}

export async function goldenCommand(options: GoldenOptions): Promise<void> {
  const {
    list = false,
    create: createPath,
    update: updateId,
    validate: validatePath,
    dir = 'golden',
  } = options;

  try {
    if (list) {
      await listGoldens(dir);
    } else if (createPath) {
      await createGoldenCmd(dir, createPath);
    } else if (updateId) {
      await updateGoldenCmd(dir, updateId);
    } else if (validatePath) {
      await validateGoldenCmd(validatePath);
    } else {
      await listGoldens(dir);
    }
  } catch (error) {
    cliError('Golden management failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function listGoldens(dir: string): Promise<void> {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const dirPath = resolve(dir);

  if (!fs.existsSync(dirPath)) {
    cliOut('No golden trajectories found.');
    return;
  }

  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.jsonl'));
  const goldens: ManagerGoldenTrajectory[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(dirPath, file), 'utf-8');
      goldens.push(...loadGoldenTrajectories(content));
    } catch {
      // skip invalid files
    }
  }

  if (goldens.length === 0) {
    cliOut('No golden trajectories found.');
    return;
  }

  cliOut('\n=== Golden Trajectories ===');
  cliOut(`Found ${goldens.length} golden trajectories:\n`);

  for (const golden of goldens) {
    cliOut(`ID: ${golden.id}`);
    cliOut(`  Description: ${golden.metadata.description || 'Unnamed'}`);
    cliOut(`  Turns: ${golden.trajectory.turns.length}`);
    cliOut(`  Version: ${golden.metadata.version}`);
    cliOut('');
  }
}

async function createGoldenCmd(dir: string, sourcePath: string): Promise<void> {
  const resolvedPath = resolve(sourcePath);

  if (!existsSync(resolvedPath)) {
    cliError(`Source file not found: ${resolvedPath}`);
    process.exit(1);
  }

  const trajectory = await loadFromFile(resolvedPath);
  const curator = new GoldenCurator(trajectory);
  curator.start({ description: `Golden from ${sourcePath}`, tags: ['auto-created'] });
  curator.autoAnnotate();
  const qualityReport = curator.runQualityChecks();

  if (qualityReport.score < 80) {
    cliWarn(`Warning: Trajectory quality score is ${qualityReport.score} (below 80 threshold)`);
    cliWarn('Issues found:');
    for (const issue of qualityReport.issues) {
      cliWarn(`  - [${issue.severity}] ${issue.description}`);
    }
  }

  const golden = createGolden(trajectory, {
    description: `Created from ${sourcePath}`,
    tags: ['auto-created'],
  });

  const fs = await import('node:fs');
  const path = await import('node:path');
  fs.mkdirSync(resolve(dir), { recursive: true });
  const outPath = path.join(resolve(dir), `${golden.id}.jsonl`);
  saveToFile(golden.trajectory, outPath);

  cliOut('\n=== Golden Created ===');
  cliOut(`ID: ${golden.id}`);
  cliOut(`Turns: ${golden.trajectory.turns.length}`);
  cliOut(`Quality Score: ${qualityReport.score}/100`);
  cliOut(`Saved to: ${outPath}`);
}

async function updateGoldenCmd(dir: string, goldenId: string): Promise<void> {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const dirPath = resolve(dir);

  if (!fs.existsSync(dirPath)) {
    cliError(`Golden directory not found: ${dirPath}`);
    process.exit(1);
  }

  let found = false;
  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.jsonl'));

  for (const file of files) {
    const content = fs.readFileSync(path.join(dirPath, file), 'utf-8');
    const goldens = loadGoldenTrajectories(content);
    const existing = goldens.find((g) => g.id === goldenId);
    if (existing) {
      found = true;
      const curator = new GoldenCurator(existing.trajectory);
      curator.start(existing.metadata);
      const qualityReport = curator.runQualityChecks();

      const updated = updateGolden(existing, {
        description: existing.metadata.description,
        tags: existing.metadata.tags,
      });

      cliOut('\n=== Golden Updated ===');
      cliOut(`ID: ${updated.id}`);
      cliOut(`Version: ${updated.metadata.version}`);
      cliOut(`Quality Score: ${qualityReport.score}/100`);
      break;
    }
  }

  if (!found) {
    cliError(`Golden trajectory not found: ${goldenId}`);
    process.exit(1);
  }
}

async function validateGoldenCmd(goldenPath: string): Promise<void> {
  const resolvedPath = resolve(goldenPath);

  if (!existsSync(resolvedPath)) {
    cliError(`Golden file not found: ${resolvedPath}`);
    process.exit(1);
  }

  const fs = await import('node:fs');
  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const goldens = loadGoldenTrajectories(content);

  if (goldens.length === 0) {
    cliError('No golden trajectories found in file');
    process.exit(1);
  }

  for (const golden of goldens) {
    const validation = validateGolden(golden);
    const curator = new GoldenCurator(golden.trajectory);
    curator.start(golden.metadata);
    curator.autoAnnotate();
    const qualityReport = curator.runQualityChecks();

    cliOut('\n=== Golden Validation Report ===');
    cliOut(`ID: ${golden.id}`);
    cliOut(`Valid: ${validation.valid ? '✅ Yes' : '❌ No'}`);
    cliOut(`Validation Score: ${validation.score.toFixed(2)}`);
    cliOut(`Quality Score: ${qualityReport.score}/100`);

    if (validation.errors.length > 0) {
      cliOut('\nErrors:');
      for (const err of validation.errors) {
        cliOut(`  - ${err}`);
      }
    }

    if (qualityReport.issues.length > 0) {
      cliOut('\nIssues:');
      for (const issue of qualityReport.issues) {
        cliOut(`  - [${issue.severity}] ${issue.description}`);
      }
    }

    if (qualityReport.suggestions.length > 0) {
      cliOut('\nSuggestions:');
      for (const rec of qualityReport.suggestions) {
        cliOut(`  - ${rec}`);
      }
    }

    if (!validation.valid || qualityReport.score < 80) {
      process.exit(1);
    }
  }
}
