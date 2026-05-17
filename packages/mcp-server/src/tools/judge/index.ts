import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { checkBudget } from '@reaatech/agent-eval-harness-cost';
import { calculateTrajectoryCost } from '@reaatech/agent-eval-harness-cost';
import { JudgeEngine } from '@reaatech/agent-eval-harness-judge';
import type { JudgeConfig, JudgeRequest } from '@reaatech/agent-eval-harness-judge';
import { monitorLatency } from '@reaatech/agent-eval-harness-latency';
import type { Trajectory } from '@reaatech/agent-eval-harness-types';
import { z } from 'zod';

const FaithfulnessInputSchema = z.object({
  context: z.string(),
  response: z.string(),
});

const RelevanceInputSchema = z.object({
  intent: z.string(),
  response: z.string(),
});

const ToolCorrectnessInputSchema = z.object({
  expected_tool: z.string(),
  actual_tool: z.string(),
  arguments: z.record(z.string(), z.unknown()).optional(),
  result: z.record(z.string(), z.unknown()).optional(),
});

const CostCheckInputSchema = z.object({
  trajectory: z.unknown(),
  budget: z.number(),
});

const LatencyCheckInputSchema = z.object({
  trajectory: z.unknown(),
  sla: z.number(),
});

const JUDGE_TOOLS: Tool[] = [
  {
    name: 'eval.judge.faithfulness',
    description: 'Score response faithfulness to context',
    inputSchema: {
      type: 'object',
      properties: {
        context: {
          type: 'string',
          description: 'The context or source material',
        },
        response: {
          type: 'string',
          description: 'The response to evaluate',
        },
      },
      required: ['context', 'response'],
    },
  },
  {
    name: 'eval.judge.relevance',
    description: 'Score response relevance to intent',
    inputSchema: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          description: 'The user intent or query',
        },
        response: {
          type: 'string',
          description: 'The response to evaluate',
        },
      },
      required: ['intent', 'response'],
    },
  },
  {
    name: 'eval.judge.tool_correctness',
    description: 'Validate tool call correctness',
    inputSchema: {
      type: 'object',
      properties: {
        expected_tool: {
          type: 'string',
          description: 'The expected tool name',
        },
        actual_tool: {
          type: 'string',
          description: 'The actual tool name used',
        },
        arguments: {
          type: 'object',
          description: 'The arguments passed to the tool',
        },
        result: {
          type: 'object',
          description: 'The tool execution result',
        },
      },
      required: ['expected_tool', 'actual_tool'],
    },
  },
  {
    name: 'eval.judge.cost_check',
    description: 'Verify cost within budget',
    inputSchema: {
      type: 'object',
      properties: {
        trajectory: {
          type: 'object',
          description: 'The trajectory with cost data',
        },
        budget: {
          type: 'number',
          description: 'The budget limit',
        },
      },
      required: ['trajectory', 'budget'],
    },
  },
  {
    name: 'eval.judge.latency_check',
    description: 'Verify latency within SLA',
    inputSchema: {
      type: 'object',
      properties: {
        trajectory: {
          type: 'object',
          description: 'The trajectory with latency data',
        },
        sla: {
          type: 'number',
          description: 'The SLA threshold in milliseconds',
        },
      },
      required: ['trajectory', 'sla'],
    },
  },
];

export async function executeJudgeTool(name: string, args: unknown): Promise<unknown> {
  const config: JudgeConfig = { model: 'claude-opus', provider: 'claude' };
  const judgeEngine = new JudgeEngine(config);

  switch (name) {
    case 'eval.judge.faithfulness': {
      const input = FaithfulnessInputSchema.parse(args);
      return await judgeEngine.judge({
        type: 'faithfulness',
        context: input.context,
        response: input.response,
      });
    }

    case 'eval.judge.relevance': {
      const input = RelevanceInputSchema.parse(args);
      return await judgeEngine.judge({
        type: 'relevance',
        intent: input.intent,
        response: input.response,
      });
    }

    case 'eval.judge.tool_correctness': {
      const input = ToolCorrectnessInputSchema.parse(args);
      const request: JudgeRequest = {
        type: 'tool_correctness',
        response: JSON.stringify(input.result || {}),
        expected_tool: input.expected_tool,
        actual_tool: input.actual_tool,
      };
      if (input.arguments !== undefined) {
        request.arguments = input.arguments;
      }
      return await judgeEngine.judge(request);
    }

    case 'eval.judge.cost_check': {
      const input = CostCheckInputSchema.parse(args);
      const cost = calculateTrajectoryCost(input.trajectory as Trajectory, 'claude-opus');
      const budgetResult = checkBudget(cost, { perTrajectory: input.budget });
      return {
        within_budget: budgetResult.withinBudget,
        cost: budgetResult.currentCost,
        budget: budgetResult.budgetLimit,
        usage_percentage: budgetResult.usagePercentage,
      };
    }

    case 'eval.judge.latency_check': {
      const input = LatencyCheckInputSchema.parse(args);
      const latencyResult = monitorLatency(input.trajectory as Trajectory);
      return {
        within_sla: latencyResult.p99Ms <= input.sla,
        p99_ms: latencyResult.p99Ms,
        p50_ms: latencyResult.p50Ms,
        p90_ms: latencyResult.p90Ms,
        total_ms: latencyResult.totalLatencyMs,
      };
    }

    default:
      throw new Error(`Unknown judge tool: ${name}`);
  }
}

export function registerJudgeTools(): Tool[] {
  return JUDGE_TOOLS;
}
