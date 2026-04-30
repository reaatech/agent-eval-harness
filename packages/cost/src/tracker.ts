import type { CostBreakdown, Trajectory, Turn } from '@reaatech/agent-eval-harness-types';

export interface ProviderPricing {
  input: number;
  output: number;
}

export const DEFAULT_PRICING: Record<string, ProviderPricing> = {
  'claude-opus': { input: 15.0, output: 75.0 },
  'claude-sonnet': { input: 3.0, output: 15.0 },
  'claude-haiku': { input: 0.25, output: 1.25 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'gpt-4': { input: 30.0, output: 60.0 },
  'gpt-4-mini': { input: 3.0, output: 10.0 },
  'gemini-pro': { input: 2.5, output: 7.5 },
  'gemini-flash': { input: 0.075, output: 0.3 },
};

export interface CostOptions {
  customPricing?: Record<string, ProviderPricing>;
  includeToolCosts?: boolean;
  toolInvocationCost?: number;
}

export interface TurnCost {
  turn_id: number;
  cost: number;
  llm_cost: number;
  tool_cost: number;
  total_cost: number;
  input_tokens?: number;
  output_tokens?: number;
}

export function calculateTurnCost(
  turn: Turn,
  provider: string,
  options: CostOptions = {},
): TurnCost {
  const { customPricing = {}, includeToolCosts = true, toolInvocationCost = 0.0001 } = options;

  const pricing = customPricing[provider] || DEFAULT_PRICING[provider];

  if (!pricing) {
    throw new Error(`Unknown provider: ${provider}. Provide custom pricing.`);
  }

  const inputTokens = turn.cost?.input_tokens || estimateInputTokens(turn);
  const outputTokens = turn.cost?.output_tokens || estimateOutputTokens(turn);

  const llmCost =
    (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;

  let toolCost = 0;
  if (includeToolCosts && turn.tool_calls) {
    toolCost = turn.tool_calls.length * toolInvocationCost;
  }

  return {
    turn_id: turn.turn_id,
    llm_cost: Math.round(llmCost * 10000) / 10000,
    tool_cost: Math.round(toolCost * 10000) / 10000,
    cost: Math.round((llmCost + toolCost) * 10000) / 10000,
    total_cost: Math.round((llmCost + toolCost) * 10000) / 10000,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  };
}

export function calculateTrajectoryCost(
  trajectory: Trajectory,
  provider: string,
  options: CostOptions = {},
): CostBreakdown {
  const turnCosts: TurnCost[] = [];
  let totalLlmCost = 0;
  let totalToolCost = 0;

  for (const turn of trajectory.turns) {
    if (turn.role === 'agent') {
      const turnCost = calculateTurnCost(turn, provider, options);
      turnCosts.push(turnCost);
      totalLlmCost += turnCost.llm_cost;
      totalToolCost += turnCost.tool_cost;
    }
  }

  return {
    total_cost: Math.round((totalLlmCost + totalToolCost) * 10000) / 10000,
    llm_cost: Math.round(totalLlmCost * 10000) / 10000,
    tool_cost: Math.round(totalToolCost * 10000) / 10000,
    per_turn: turnCosts,
    input_tokens: turnCosts.reduce((sum, tc) => sum + (tc.input_tokens || 0), 0),
    output_tokens: turnCosts.reduce((sum, tc) => sum + (tc.output_tokens || 0), 0),
  };
}

function estimateInputTokens(turn: Turn): number {
  const contentLength = turn.content.length;

  let toolOverhead = 0;
  if (turn.tool_calls) {
    toolOverhead = turn.tool_calls.reduce((sum, tc) => {
      return sum + JSON.stringify(tc).length;
    }, 0);
  }

  return Math.round((contentLength + toolOverhead) / 4);
}

function estimateOutputTokens(turn: Turn): number {
  return Math.round(turn.content.length / 4);
}

export function compareCosts(
  baseline: CostBreakdown,
  candidate: CostBreakdown,
): {
  costDiff: number;
  percentageChange: number;
  cheaper: boolean;
} {
  const costDiff = candidate.total_cost - baseline.total_cost;
  const percentageChange =
    baseline.total_cost > 0 ? (costDiff / baseline.total_cost) * 100 : costDiff > 0 ? 100 : 0;

  return {
    costDiff: Math.round(costDiff * 10000) / 10000,
    percentageChange: Math.round(percentageChange * 100) / 100,
    cheaper: costDiff < 0,
  };
}

export function getCostPerMetric(
  cost: CostBreakdown,
  metric: 'turn' | 'tool_call' | 'trajectory',
  trajectory: Trajectory,
): number {
  switch (metric) {
    case 'turn': {
      const agentTurns = trajectory.turns.filter((t) => t.role === 'agent').length;
      return agentTurns > 0 ? cost.total_cost / agentTurns : 0;
    }
    case 'tool_call': {
      const toolCalls = trajectory.turns.reduce((sum, t) => {
        return sum + (t.tool_calls?.length || 0);
      }, 0);
      return toolCalls > 0 ? cost.total_cost / toolCalls : 0;
    }
    case 'trajectory':
      return cost.total_cost;
    default:
      return 0;
  }
}
