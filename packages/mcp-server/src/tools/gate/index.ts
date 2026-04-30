import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { CIIntegration } from '@reaatech/agent-eval-harness-gate';
import { createGateEngine } from '@reaatech/agent-eval-harness-gate';
import type { GateDefinition, GateEvaluationSummary } from '@reaatech/agent-eval-harness-gate';
import type { RunComparisonResult } from '@reaatech/agent-eval-harness-suite';
import type { AggregatedResults } from '@reaatech/agent-eval-harness-suite';
import { z } from 'zod';

const GateRunInputSchema = z.object({
  run_id: z.string().optional(),
  gate_config: z.string().optional(),
  results: z.unknown().optional(),
  comparison: z.unknown().optional(),
});

const GateConfigInputSchema = z.object({
  action: z.enum(['get', 'set', 'list']),
  config: z.array(z.record(z.unknown())).optional(),
  preset: z.enum(['standard', 'strict', 'lenient']).optional(),
});

const GateDiffInputSchema = z.object({
  baseline: z.unknown(),
  candidate: z.unknown(),
  metrics: z.array(z.string()).optional(),
});

const gateResults = new Map<string, GateEvaluationSummary>();
let currentGates: GateDefinition[] = [];

const GATE_TOOLS: Tool[] = [
  {
    name: 'eval.gate.run',
    description: 'Run CI-style pass/fail gate',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: {
          type: 'string',
          description: 'The evaluation run ID',
        },
        gate_config: {
          type: 'string',
          description: 'Gate configuration (YAML string or path)',
        },
        results: {
          type: 'object',
          description: 'Evaluation results (if not using run_id)',
        },
        comparison: {
          type: 'object',
          description: 'Comparison results for baseline gates',
        },
      },
      required: [],
    },
  },
  {
    name: 'eval.gate.config',
    description: 'Get/set gate configuration',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'set', 'list'],
          description: 'Action to perform',
        },
        config: {
          type: 'array',
          items: { type: 'object' },
          description: 'Gate definitions (for set action)',
        },
        preset: {
          type: 'string',
          enum: ['standard', 'strict', 'lenient'],
          description: 'Preset to use (for set action)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'eval.gate.diff',
    description: 'Get detailed diff from baseline',
    inputSchema: {
      type: 'object',
      properties: {
        baseline: {
          type: 'object',
          description: 'Baseline results',
        },
        candidate: {
          type: 'object',
          description: 'Candidate results',
        },
        metrics: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific metrics to compare',
        },
      },
      required: ['baseline', 'candidate'],
    },
  },
];

export async function executeGateTool(name: string, args: unknown): Promise<unknown> {
  switch (name) {
    case 'eval.gate.run': {
      const input = GateRunInputSchema.parse(args);

      if (!currentGates.length && !input.gate_config) {
        return {
          error: 'No gate configuration loaded. Use eval.gate.config to set gates first.',
        };
      }

      if (!input.results) {
        return { error: 'Evaluation results required' };
      }

      const engine = createGateEngine(currentGates);
      const summary = engine.evaluate(
        input.results as AggregatedResults,
        input.comparison as RunComparisonResult | undefined,
      );

      if (input.run_id) {
        gateResults.set(input.run_id, summary);
      }

      return {
        run_id: input.run_id,
        passed: summary.overallPassed,
        total_gates: summary.totalGates,
        passed_gates: summary.passedGates,
        failed_gates: summary.failedGates,
        results: summary.results,
        duration_ms: summary.durationMs,
        exit_code: CIIntegration.getExitCode(summary),
      };
    }

    case 'eval.gate.config': {
      const input = GateConfigInputSchema.parse(args);

      switch (input.action) {
        case 'get':
          return { gates: currentGates };

        case 'set':
          if (input.config) {
            currentGates = input.config as unknown as GateDefinition[];
          } else if (input.preset) {
            const { getStandardPreset, getStrictPreset, getLenientPreset } = await import(
              '@reaatech/agent-eval-harness-gate'
            );
            switch (input.preset) {
              case 'standard':
                currentGates = getStandardPreset().gates;
                break;
              case 'strict':
                currentGates = getStrictPreset().gates;
                break;
              case 'lenient':
                currentGates = getLenientPreset().gates;
                break;
            }
          }
          return { success: true, gates_loaded: currentGates.length };

        case 'list':
          return {
            gates: currentGates.map((g) => ({
              name: g.name,
              type: g.type,
              description: g.description,
              enabled: g.enabled !== false,
            })),
          };

        default:
          return { error: `Unknown action: ${(input as { action: string }).action}` };
      }
    }

    case 'eval.gate.diff': {
      const input = GateDiffInputSchema.parse(args);

      const { RunComparator } = await import('@reaatech/agent-eval-harness-suite');
      const comparator = new RunComparator();
      const comparison = comparator.compare(
        input.baseline as AggregatedResults,
        input.candidate as AggregatedResults,
      );

      let filteredDiffs = comparison.metricDiffs;
      if (input.metrics && input.metrics.length > 0) {
        filteredDiffs = filteredDiffs.filter((d) => input.metrics?.includes(d.metric));
      }

      return {
        baseline_run_id: comparison.baselineRunId,
        candidate_run_id: comparison.candidateRunId,
        score_diff: comparison.scoreDiff,
        metric_diffs: filteredDiffs,
        regressions: comparison.regressions,
        improvements: comparison.improvements,
        verdict: comparison.summary.verdict,
        recommendation: comparison.summary.recommendation,
        key_findings: comparison.summary.keyFindings,
      };
    }

    default:
      throw new Error(`Unknown gate tool: ${name}`);
  }
}

export function registerGateTools(): Tool[] {
  return GATE_TOOLS;
}

export function loadGateConfig(gates: GateDefinition[]): void {
  currentGates = gates;
}

export function getCurrentGateConfig(): GateDefinition[] {
  return currentGates;
}
