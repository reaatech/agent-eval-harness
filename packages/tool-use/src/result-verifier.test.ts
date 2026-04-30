import type { ToolCall, Trajectory, Turn } from '@reaatech/agent-eval-harness-types';
import { describe, expect, it } from 'vitest';
import { summarizeResultVerification, verifyResult, verifyTurnResults } from './result-verifier.js';
import type { VerifyOptions } from './result-verifier.js';

function makeTurn(overrides: { [K in keyof Turn]?: Turn[K] | undefined } = {}): Turn {
  const result: Record<string, unknown> = {
    turn_id: 1,
    role: 'agent',
    content: '',
    timestamp: '2026-04-17T12:00:00Z',
  };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) {
      delete result[k];
    } else {
      result[k] = v;
    }
  }
  return result as unknown as Turn;
}

function makeTrajectory(turns: Turn[]): Trajectory {
  return { turns };
}

describe('verifyResult', () => {
  it('returns valid for a properly integrated result', () => {
    const toolCall: ToolCall = {
      name: 'get_weather',
      arguments: { city: 'NYC' },
      result: { temperature: 72, unit: 'fahrenheit' },
    };
    const turn = makeTurn({
      content: 'The current temperature is 72 degrees fahrenheit.',
      tool_calls: [toolCall],
    });

    const result = verifyResult(toolCall, turn);

    expect(result.valid).toBe(true);
    expect(result.hallucinated).toBe(false);
    expect(result.integrated).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it('detects missing result', () => {
    const toolCall: ToolCall = {
      name: 'get_weather',
      arguments: { city: 'NYC' },
    };
    const turn = makeTurn({
      content: 'Let me check the weather.',
      tool_calls: [toolCall],
    });

    const result = verifyResult(toolCall, turn);

    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.type === 'missing_result')).toBe(true);
    expect(result.integrated).toBe(false);
    expect(result.score).toBe(0.3);
  });

  it('detects empty result', () => {
    const toolCall: ToolCall = {
      name: 'get_weather',
      arguments: { city: 'NYC' },
      result: {},
    };
    const turn = makeTurn({
      content: 'Here is the weather info.',
      tool_calls: [toolCall],
    });

    const result = verifyResult(toolCall, turn);

    expect(result.issues.some((i) => i.type === 'empty_result')).toBe(true);
  });

  it('detects error result', () => {
    const toolCall: ToolCall = {
      name: 'get_weather',
      arguments: { city: 'NYC' },
      result: { status: 'error', error: 'City not found' },
    };
    const turn = makeTurn({
      content: 'Sorry, I could not find weather data for that city.',
      tool_calls: [toolCall],
    });

    const result = verifyResult(toolCall, turn);

    expect(result.issues.some((i) => i.type === 'error_result')).toBe(true);
    expect(result.issues.some((i) => i.severity === 'high')).toBe(true);
  });

  it('detects unused result', () => {
    const toolCall: ToolCall = {
      name: 'get_weather',
      arguments: { city: 'NYC' },
      result: { temperature: 72, conditions: 'sunny and warm' },
    };
    const turn = makeTurn({
      content: 'I checked the weather.',
      tool_calls: [toolCall],
    });

    const result = verifyResult(toolCall, turn);

    expect(result.issues.some((i) => i.type === 'unused_result')).toBe(true);
    expect(result.integrated).toBe(false);
  });

  it('detects contradiction between result and response', () => {
    const toolCall: ToolCall = {
      name: 'send_email',
      arguments: { to: 'a@b.com' },
      result: { status: 'sent', id: 'msg-1' },
    };
    const turn = makeTurn({
      content: 'Sorry, I failed to send the email. There was an error.',
      tool_calls: [toolCall],
    });

    const result = verifyResult(toolCall, turn);

    expect(result.issues.some((i) => i.type === 'contradicts_response')).toBe(true);
  });

  it('respects checkUsage option disabled', () => {
    const toolCall: ToolCall = {
      name: 'get_weather',
      arguments: { city: 'NYC' },
      result: { temperature: 72 },
    };
    const turn = makeTurn({
      content: 'I checked the weather.',
      tool_calls: [toolCall],
    });
    const options: VerifyOptions = { checkUsage: false };

    const result = verifyResult(toolCall, turn, undefined, options);

    expect(result.issues.some((i) => i.type === 'unused_result')).toBe(false);
  });

  it('respects detectHallucination option disabled', () => {
    const toolCall: ToolCall = {
      name: 'get_weather',
      arguments: { city: 'NYC' },
      result: { temperature: 72 },
    };
    const turn = makeTurn({
      content: 'The temperature is 85 degrees.',
      tool_calls: [toolCall],
    });
    const options: VerifyOptions = { detectHallucination: false };

    const result = verifyResult(toolCall, turn, undefined, options);

    expect(result.hallucinated).toBe(false);
    expect(result.issues.some((i) => i.type === 'hallucinated_content')).toBe(false);
  });

  it('respects checkContradictions option disabled', () => {
    const toolCall: ToolCall = {
      name: 'send_email',
      arguments: { to: 'a@b.com' },
      result: { status: 'success' },
    };
    const turn = makeTurn({
      content: 'Failed to send email, error occurred.',
      tool_calls: [toolCall],
    });
    const options: VerifyOptions = { checkContradictions: false };

    const result = verifyResult(toolCall, turn, undefined, options);

    expect(result.issues.some((i) => i.type === 'contradicts_response')).toBe(false);
  });

  it('checks future turns for result usage via trajectory', () => {
    const toolCall: ToolCall = {
      name: 'get_weather',
      arguments: { city: 'NYC' },
      result: { temperature: 'seventy two degrees', conditions: 'sunny and warm' },
    };
    const agentTurn = makeTurn({
      turn_id: 1,
      content: 'Let me check.',
      tool_calls: [toolCall],
    });
    const userTurn = makeTurn({
      turn_id: 2,
      role: 'user',
      content: 'What is it?',
      tool_calls: undefined,
    });
    const followUpTurn = makeTurn({
      turn_id: 3,
      content: 'The temperature is seventy two degrees.',
      tool_calls: undefined,
    });
    const trajectory = makeTrajectory([agentTurn, userTurn, followUpTurn]);

    const result = verifyResult(toolCall, agentTurn, trajectory);

    expect(result.integrated).toBe(true);
  });

  it('uses hallucinationThreshold option', () => {
    const toolCall: ToolCall = {
      name: 'get_data',
      arguments: {},
      result: { value: 'some_fabricated_data_string' },
    };
    const turn = makeTurn({
      content: 'Here is the data.',
      tool_calls: [toolCall],
    });

    const lowThreshold = verifyResult(toolCall, turn, undefined, { hallucinationThreshold: 0.0 });
    const highThreshold = verifyResult(toolCall, turn, undefined, { hallucinationThreshold: 1.0 });

    expect(lowThreshold.hallucinated).toBe(true);
    expect(highThreshold.hallucinated).toBe(false);
  });
});

describe('verifyTurnResults', () => {
  it('returns empty for turn with no tool calls', () => {
    const turn = makeTurn({ tool_calls: undefined });
    const results = verifyTurnResults(turn);

    expect(results).toHaveLength(0);
  });

  it('verifies each tool call in a turn', () => {
    const toolCall1: ToolCall = {
      name: 'search',
      arguments: { query: 'test' },
      result: { total_results: 'found 5 items' },
    };
    const toolCall2: ToolCall = {
      name: 'get_detail',
      arguments: { id: '123' },
      result: { name: 'Item 123' },
    };
    const turn = makeTurn({
      content: 'I found 5 items. The item name is Item 123.',
      tool_calls: [toolCall1, toolCall2],
    });

    const results = verifyTurnResults(turn);

    expect(results).toHaveLength(2);
    expect(results[0]?.integrated).toBe(true);
    expect(results[1]?.integrated).toBe(true);
  });

  it('passes trajectory and options to verifyResult', () => {
    const toolCall: ToolCall = {
      name: 'search',
      arguments: { query: 'test' },
      result: { count: 5 },
    };
    const turn = makeTurn({
      content: '',
      tool_calls: [toolCall],
    });
    const trajectory = makeTrajectory([turn]);
    const options: VerifyOptions = { checkUsage: false };

    const results = verifyTurnResults(turn, trajectory, options);

    expect(results).toHaveLength(1);
    expect(results[0]?.issues.some((i) => i.type === 'unused_result')).toBe(false);
  });
});

describe('summarizeResultVerification', () => {
  it('returns zero counts for trajectory with no tool calls', () => {
    const trajectory = makeTrajectory([
      makeTurn({ role: 'user', tool_calls: undefined }),
      makeTurn({ role: 'agent', tool_calls: undefined }),
    ]);
    const summary = summarizeResultVerification(trajectory);

    expect(summary.totalTools).toBe(0);
    expect(summary.validResults).toBe(0);
    expect(summary.hallucinatedResults).toBe(0);
    expect(summary.integratedResults).toBe(0);
    expect(summary.averageScore).toBe(1);
    expect(summary.issues).toHaveLength(0);
  });

  it('summarizes results across all turns', () => {
    const toolCall1: ToolCall = {
      name: 'search',
      arguments: { query: 'test' },
      result: { total_results: 'found 5 items' },
    };
    const toolCall2: ToolCall = {
      name: 'get_weather',
      arguments: { city: 'NYC' },
      result: { temperature: 'seventy two degrees' },
    };
    const trajectory = makeTrajectory([
      makeTurn({
        turn_id: 1,
        role: 'agent',
        content: 'I found 5 items.',
        tool_calls: [toolCall1],
      }),
      makeTurn({
        turn_id: 2,
        role: 'agent',
        content: 'The temperature is seventy two degrees.',
        tool_calls: [toolCall2],
      }),
    ]);

    const summary = summarizeResultVerification(trajectory);

    expect(summary.totalTools).toBe(2);
    expect(summary.validResults).toBe(2);
    expect(summary.hallucinatedResults).toBe(0);
    expect(summary.integratedResults).toBe(2);
    expect(summary.averageScore).toBe(1.0);
    expect(summary.issues).toHaveLength(0);
  });

  it('counts hallucinated and unintegrated results', () => {
    const toolCall1: ToolCall = {
      name: 'search',
      arguments: { query: 'test' },
      result: { data: 'some_long_fabricated_value' },
    };
    const toolCall2: ToolCall = {
      name: 'get_weather',
      arguments: { city: 'NYC' },
    };
    const trajectory = makeTrajectory([
      makeTurn({
        turn_id: 1,
        role: 'agent',
        content: 'Here are results.',
        tool_calls: [toolCall1],
      }),
      makeTurn({
        turn_id: 2,
        role: 'agent',
        content: 'I checked the weather.',
        tool_calls: [toolCall2],
      }),
    ]);

    const summary = summarizeResultVerification(trajectory);

    expect(summary.totalTools).toBe(2);
    expect(summary.issues.length).toBeGreaterThan(0);
  });

  it('passes options through to verifyResult', () => {
    const toolCall: ToolCall = {
      name: 'search',
      arguments: { query: 'test' },
    };
    const trajectory = makeTrajectory([
      makeTurn({
        role: 'agent',
        content: '',
        tool_calls: [toolCall],
      }),
    ]);
    const options: VerifyOptions = { detectHallucination: false, checkUsage: false };

    const summary = summarizeResultVerification(trajectory, options);

    expect(summary.issues.some((i) => i.type === 'hallucinated_content')).toBe(false);
    expect(summary.issues.some((i) => i.type === 'unused_result')).toBe(false);
  });

  it('calculates average score correctly', () => {
    const toolCall1: ToolCall = {
      name: 'tool_a',
      arguments: {},
      result: { status: 'sent' },
    };
    const toolCall2: ToolCall = {
      name: 'tool_b',
      arguments: {},
      result: { status: 'sent' },
    };
    const trajectory = makeTrajectory([
      makeTurn({
        turn_id: 1,
        role: 'agent',
        content: 'Done and done.',
        tool_calls: [toolCall1],
      }),
      makeTurn({
        turn_id: 2,
        role: 'agent',
        content: 'Also done.',
        tool_calls: [toolCall2],
      }),
    ]);

    const summary = summarizeResultVerification(trajectory);

    expect(summary.averageScore).toBeGreaterThanOrEqual(0);
    expect(summary.averageScore).toBeLessThanOrEqual(1);
  });
});
