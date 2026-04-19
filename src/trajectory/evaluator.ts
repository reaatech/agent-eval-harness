import type { Trajectory, Turn, EvalResult, EvalIssue } from '../types/domain.js';

/**
 * Evaluation options
 */
export interface EvaluateOptions {
  /** Check multi-turn coherence */
  checkCoherence?: boolean;
  /** Verify goal completion */
  checkGoalCompletion?: boolean;
  /** Analyze conversation flow */
  analyzeFlow?: boolean;
  /** Minimum coherence score threshold */
  coherenceThreshold?: number;
}

/**
 * Coherence analysis result
 */
export interface CoherenceResult {
  score: number;
  issues: string[];
  turnTransitions: TurnTransition[];
}

/**
 * Turn transition quality
 */
export interface TurnTransition {
  from: number;
  to: number;
  coherent: boolean;
  reason?: string;
}

/**
 * Goal completion analysis
 */
export interface GoalCompletionResult {
  completed: boolean;
  confidence: number;
  evidence: string[];
  unresolvedTurns?: number[];
}

/**
 * Conversation flow analysis
 */
export interface FlowAnalysis {
  avgTurnsPerTopic: number;
  topicChanges: number;
  interruptions: number;
  flowScore: number;
}

/**
 * Evaluate a trajectory for quality metrics
 */
export function evaluate(trajectory: Trajectory, options: EvaluateOptions = {}): EvalResult {
  const {
    checkCoherence = true,
    checkGoalCompletion = true,
    analyzeFlow = true,
    coherenceThreshold = 0.7,
  } = options;

  const issues: EvalIssue[] = [];
  const metrics: EvalResult['metrics'] = {};
  let overallScore = 1.0;

  // Check coherence
  if (checkCoherence) {
    const coherence = analyzeCoherence(trajectory);
    metrics.coherence = coherence.score;

    if (coherence.score < coherenceThreshold) {
      issues.push({
        type: 'low_coherence',
        severity: coherence.score < 0.5 ? 'high' : 'medium',
        description: `Trajectory coherence score ${coherence.score.toFixed(2)} is below threshold ${coherenceThreshold}`,
      });
      overallScore -= (1 - coherence.score) * 0.2;
    }

    for (const issue of coherence.issues) {
      issues.push({
        type: 'coherence_issue',
        severity: 'low',
        description: issue,
      });
    }
  }

  // Check goal completion
  if (checkGoalCompletion) {
    const goalCompletion = analyzeGoalCompletion(trajectory);
    metrics.goal_completion = goalCompletion.confidence;

    if (!goalCompletion.completed) {
      issues.push({
        type: 'incomplete_goal',
        severity: 'high',
        description: "Trajectory does not appear to complete the user's goal",
      });
      overallScore -= 0.3;
    }
  }

  // Analyze flow
  if (analyzeFlow) {
    const flow = analyzeConversationFlow(trajectory);
    // Flow score contributes to overall
    overallScore = overallScore * 0.8 + flow.flowScore * 0.2;
  }

  // Check for tool-use issues
  const toolIssues = checkToolUse(trajectory);
  issues.push(...toolIssues);

  // Ensure score is within bounds
  overallScore = Math.max(0, Math.min(1, overallScore));

  return {
    trajectory_id: trajectory.trajectory_id || 'unknown',
    overall_score: Math.round(overallScore * 100) / 100,
    metrics,
    issues,
    passed: overallScore >= 0.7 && issues.filter((i) => i.severity === 'high').length === 0,
    evaluated_at: new Date().toISOString(),
  };
}

/**
 * Analyze multi-turn coherence
 */
export function analyzeCoherence(trajectory: Trajectory): CoherenceResult {
  const turns = trajectory.turns;
  const issues: string[] = [];
  const transitions: TurnTransition[] = [];
  let score = 1.0;

  for (let i = 1; i < turns.length; i++) {
    const prev = turns[i - 1]!;
    const curr = turns[i]!;

    const transition = analyzeTurnTransition(prev, curr, i);
    transitions.push(transition);

    if (!transition.coherent) {
      score -= 0.1;
      issues.push(transition.reason || 'Unknown coherence issue');
    }
  }

  // Check for orphaned tool calls
  for (const turn of turns) {
    if (turn.role === 'agent' && turn.tool_calls) {
      for (const toolCall of turn.tool_calls) {
        if (!toolCall.result) {
          issues.push(`Tool call "${toolCall.name}" in turn ${turn.turn_id} has no result`);
          score -= 0.05;
        }
      }
    }
  }

  return {
    score: Math.max(0, Math.round(score * 100) / 100),
    issues,
    turnTransitions: transitions,
  };
}

/**
 * Analyze a single turn transition
 */
function analyzeTurnTransition(prev: Turn, curr: Turn, _position: number): TurnTransition {
  // Same turn_id should be user -> agent pair
  if (prev.turn_id === curr.turn_id) {
    if (prev.role !== 'user' || curr.role !== 'agent') {
      return {
        from: prev.turn_id,
        to: curr.turn_id,
        coherent: false,
        reason: `Turn ${prev.turn_id}: expected user->agent order, got ${prev.role}->${curr.role}`,
      };
    }

    // Check if agent response is relevant to user message
    const responseRelevant = checkResponseRelevance(prev.content, curr.content);
    if (!responseRelevant) {
      return {
        from: prev.turn_id,
        to: curr.turn_id,
        coherent: false,
        reason: `Turn ${prev.turn_id}: agent response may not address user query`,
      };
    }

    return {
      from: prev.turn_id,
      to: curr.turn_id,
      coherent: true,
    };
  }

  // Different turn_id should be continuation
  if (curr.turn_id !== prev.turn_id + 1 && curr.turn_id !== prev.turn_id) {
    return {
      from: prev.turn_id,
      to: curr.turn_id,
      coherent: false,
      reason: `Gap in turn sequence: ${prev.turn_id} -> ${curr.turn_id}`,
    };
  }

  return {
    from: prev.turn_id,
    to: curr.turn_id,
    coherent: true,
  };
}

/**
 * Simple check if response addresses the query
 */
function checkResponseRelevance(_query: string, response: string): boolean {
  // Basic heuristic: response should not be empty
  if (!response.trim()) return false;

  // Check for common acknowledgment patterns
  const acknowledgments = [
    'i can help',
    'sure',
    'yes',
    'okay',
    'let me',
    "i'll",
    'i will',
    'here',
    'the',
    'your',
  ];

  const lowerResponse = response.toLowerCase();
  return acknowledgments.some((a) => lowerResponse.includes(a)) || response.length > 10;
}

/**
 * Analyze goal completion
 */
export function analyzeGoalCompletion(trajectory: Trajectory): GoalCompletionResult {
  const turns = trajectory.turns;
  const evidence: string[] = [];
  const unresolvedTurns: number[] = [];

  // Get the last agent turn
  const lastAgentTurn = [...turns].reverse().find((t) => t.role === 'agent');
  if (!lastAgentTurn) {
    return {
      completed: false,
      confidence: 0,
      evidence: ['No agent response found'],
    };
  }

  // Check if last response indicates completion
  const completionIndicators = [
    'completed',
    'done',
    'finished',
    'sent',
    'created',
    'updated',
    'success',
    'here you go',
    'all set',
  ];

  const lowerContent = lastAgentTurn.content.toLowerCase();
  const hasCompletionIndicator = completionIndicators.some((indicator) =>
    lowerContent.includes(indicator),
  );

  if (hasCompletionIndicator) {
    evidence.push('Response contains completion indicator');
  }

  // Check if tool calls succeeded
  const failedTools = turns
    .filter((t) => t.role === 'agent' && t.tool_calls)
    .flatMap((t) => t.tool_calls || [])
    .filter((tc) => tc.result && tc.result['status'] === 'error');

  if (failedTools.length > 0) {
    evidence.push(`${failedTools.length} tool call(s) failed`);
    unresolvedTurns.push(...failedTools.map(() => 0)); // Simplified
  }

  // Check if user got a response for their last message
  const lastUserTurn = [...turns].reverse().find((t) => t.role === 'user');
  if (lastUserTurn && lastUserTurn.turn_id === lastAgentTurn.turn_id) {
    evidence.push('User received a response');
  } else if (lastUserTurn) {
    evidence.push("User's last message may not have received a response");
    unresolvedTurns.push(lastUserTurn.turn_id);
  }

  const confidence = hasCompletionIndicator && failedTools.length === 0 ? 0.9 : 0.5;

  return {
    completed: hasCompletionIndicator && failedTools.length === 0,
    confidence,
    evidence,
    unresolvedTurns: [...new Set(unresolvedTurns)],
  };
}

/**
 * Analyze conversation flow
 */
export function analyzeConversationFlow(trajectory: Trajectory): FlowAnalysis {
  const turns = trajectory.turns;
  let topicChanges = 0;
  let interruptions = 0;

  // Simple heuristic: count topic changes based on content similarity
  for (let i = 2; i < turns.length; i += 2) {
    const prevUser = turns[i - 2];
    const currUser = turns[i];

    if (!prevUser || !currUser) continue;

    if (prevUser.role === 'user' && currUser.role === 'user') {
      // Check if topics seem different (very simplified)
      const prevWords = new Set(prevUser.content.toLowerCase().split(/\s+/));
      const currWords = new Set(currUser.content.toLowerCase().split(/\s+/));

      const intersection = [...prevWords].filter((w) => currWords.has(w));
      const similarity = intersection.length / Math.max(prevWords.size, currWords.size);

      if (similarity < 0.3) {
        topicChanges++;
      }
    }
  }

  // Check for interruptions (user messages without agent response)
  const userTurns = turns.filter((t) => t.role === 'user');
  const agentTurns = turns.filter((t) => t.role === 'agent');

  if (userTurns.length > agentTurns.length) {
    interruptions = userTurns.length - agentTurns.length;
  }

  const avgTurnsPerTopic = turns.length / Math.max(1, topicChanges + 1);
  const flowScore = Math.max(0, 1 - interruptions * 0.2 - topicChanges * 0.1);

  return {
    avgTurnsPerTopic: Math.round(avgTurnsPerTopic * 10) / 10,
    topicChanges,
    interruptions,
    flowScore: Math.round(flowScore * 100) / 100,
  };
}

/**
 * Check for tool-use issues
 */
function checkToolUse(trajectory: Trajectory): EvalIssue[] {
  const issues: EvalIssue[] = [];

  for (const turn of trajectory.turns) {
    if (turn.role === 'agent' && turn.tool_calls) {
      for (const toolCall of turn.tool_calls) {
        // Check for missing tool name
        if (!toolCall.name) {
          issues.push({
            type: 'missing_tool_name',
            severity: 'high',
            description: `Turn ${turn.turn_id}: tool call missing name`,
            turn_id: turn.turn_id,
          });
        }

        // Check for missing arguments
        if (!toolCall.arguments) {
          issues.push({
            type: 'missing_tool_arguments',
            severity: 'medium',
            description: `Turn ${turn.turn_id}: tool "${toolCall.name}" missing arguments`,
            turn_id: turn.turn_id,
            tool_name: toolCall.name,
          });
        }
      }
    }
  }

  return issues;
}
