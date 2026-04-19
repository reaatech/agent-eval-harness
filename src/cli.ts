#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { evalCommand } from './cli/commands/eval.command.js';
import { judgeCommand } from './cli/commands/judge.command.js';
import { compareCommand } from './cli/commands/compare.command.js';
import { gateCommand } from './cli/commands/gate.command.js';
import { goldenCommand } from './cli/commands/golden.command.js';
import { reportCommand } from './cli/commands/report.command.js';
import { cliError } from './cli/output.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getVersion(): string {
  try {
    const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
    return packageJson.version;
  } catch {
    return '0.1.0';
  }
}

const program = new Command();

program
  .name('agent-eval-harness')
  .description('End-to-end agent evaluation harness for full agent runs')
  .version(getVersion())
  .option('-v, --verbose', 'Enable verbose output', false)
  .option('-c, --config <path>', 'Path to configuration file', 'eval-config.yaml')
  .option('-o, --output <path>', 'Output directory for results', 'results');

// Eval command - run evaluation on trajectories
program
  .command('eval')
  .description('Run evaluation on trajectories')
  .argument('<paths...>', 'Paths to trajectory files or directories')
  .option('-g, --golden <path>', 'Path to golden trajectory for comparison')
  .option('-m, --metrics <metrics>', 'Comma-separated list of metrics to evaluate')
  .option('--judge-model <model>', 'Model to use for LLM judge', 'claude-opus')
  .option('--no-judge', 'Disable LLM judge evaluation')
  .option('--budget <budget>', 'Cost budget limit', '10.00')
  .option('-f, --format <format>', 'Output format (json, junit, csv)', 'json')
  .action(evalCommand);

// Judge command - run LLM judge on specific aspect
program
  .command('judge')
  .description('Run LLM judge on specific aspect')
  .argument('<aspect>', 'Judge aspect (faithfulness, relevance, tool_correctness, overall)')
  .option('-t, --trajectory <path>', 'Path to trajectory file')
  .option('--context <text>', 'Context for faithfulness evaluation')
  .option('--response <text>', 'Response to evaluate')
  .option('--intent <text>', 'User intent for relevance evaluation')
  .option('--model <model>', 'Model to use for judging', 'claude-opus')
  .option('--calibrated', 'Use calibrated scores', false)
  .action(judgeCommand);

// Compare command - compare two eval runs
program
  .command('compare')
  .description('Compare two evaluation runs')
  .argument('<baseline>', 'Path to baseline results file')
  .argument('<candidate>', 'Path to candidate results file')
  .option('--statistical', 'Run statistical significance tests', false)
  .option('-f, --format <format>', 'Output format (json, markdown, table)', 'json')
  .action(compareCommand);

// Gate command - check regression gates
program
  .command('gate')
  .description('Check regression gates')
  .argument('<results>', 'Path to evaluation results file')
  .option('--gates <path>', 'Path to gate configuration file', 'gates.yaml')
  .option('--preset <preset>', 'Gate preset (standard, strict, lenient)', 'standard')
  .option('--exit-code', 'Return CI-compatible exit code', true)
  .action(gateCommand);

// Golden command - manage golden trajectories
program
  .command('golden')
  .description('Manage golden trajectories')
  .option('-l, --list', 'List all golden trajectories')
  .option('-c, --create <path>', 'Create new golden trajectory from file')
  .option('-u, --update <id>', 'Update existing golden trajectory')
  .option('-d, --delete <id>', 'Delete golden trajectory')
  .option('--validate <path>', 'Validate golden trajectory quality')
  .option('--dir <path>', 'Golden trajectories directory', 'golden')
  .action(goldenCommand);

// Report command - generate evaluation report
program
  .command('report')
  .description('Generate evaluation report')
  .argument('<results>', 'Path to evaluation results file')
  .option('-f, --format <format>', 'Output format (html, markdown, json, pdf)', 'markdown')
  .option('-o, --output <path>', 'Output file path')
  .option('--template <path>', 'Custom report template')
  .option('--include-raw', 'Include raw trajectory data', false)
  .action(reportCommand);

// MCP server command
program
  .command('serve')
  .description('Start MCP server')
  .option('-p, --port <port>', 'Server port', '3000')
  .option('--host <host>', 'Server host', 'localhost')
  .option('--transport <transport>', 'Transport type (http, stdio)', 'http')
  .action(async () => {
    const { createMCPServer } = await import('./mcp-server/mcp-server.js');
    await createMCPServer();
  });

// Parse and execute
process.on('unhandledRejection', (error) => {
  cliError(`Fatal error: ${(error as Error).message}`);
  process.exit(1);
});

program.parse(process.argv);
