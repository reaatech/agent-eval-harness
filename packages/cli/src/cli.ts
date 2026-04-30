#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { compareCommand } from './commands/compare.command.js';
import { evalCommand } from './commands/eval.command.js';
import { gateCommand } from './commands/gate.command.js';
import { goldenCommand } from './commands/golden.command.js';
import { judgeCommand } from './commands/judge.command.js';
import { reportCommand } from './commands/report.command.js';
import { cliError } from './output.js';

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

program
  .command('compare')
  .description('Compare two evaluation runs')
  .argument('<baseline>', 'Path to baseline results file')
  .argument('<candidate>', 'Path to candidate results file')
  .option('--statistical', 'Run statistical significance tests', false)
  .option('-f, --format <format>', 'Output format (json, markdown, table)', 'json')
  .action(compareCommand);

program
  .command('gate')
  .description('Check regression gates')
  .argument('<results>', 'Path to evaluation results file')
  .option('--gates <path>', 'Path to gate configuration file', 'gates.yaml')
  .option('--preset <preset>', 'Gate preset (standard, strict, lenient)', 'standard')
  .option('--exit-code', 'Return CI-compatible exit code', true)
  .action(gateCommand);

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

program
  .command('report')
  .description('Generate evaluation report')
  .argument('<results>', 'Path to evaluation results file')
  .option('-f, --format <format>', 'Output format (html, markdown, json, pdf)', 'markdown')
  .option('-o, --output <path>', 'Output file path')
  .option('--template <path>', 'Custom report template')
  .option('--include-raw', 'Include raw trajectory data', false)
  .action(reportCommand);

program
  .command('serve')
  .description('Start MCP server')
  .option('-p, --port <port>', 'Server port', '3000')
  .option('--host <host>', 'Server host', 'localhost')
  .option('--transport <transport>', 'Transport type (http, stdio)', 'http')
  .action(async () => {
    const { createMCPServer } = await import('@reaatech/agent-eval-harness-mcp-server');
    await createMCPServer();
  });

process.on('unhandledRejection', (error) => {
  cliError(`Fatal error: ${(error as Error).message}`);
  process.exit(1);
});

program.parse(process.argv);
