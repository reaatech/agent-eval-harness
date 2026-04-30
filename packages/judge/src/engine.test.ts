import { beforeEach, describe, expect, it } from 'vitest';
import { ConsensusEngine } from './calibration.js';
import { JudgeEngine } from './engine.js';
import type { BatchJudgeResult, JudgeConfig, JudgeScore } from './engine.js';

describe('JudgeEngine', () => {
  let engine: JudgeEngine;
  let config: JudgeConfig;

  beforeEach(() => {
    config = {
      model: 'claude-opus',
      provider: 'claude',
      temperature: 0.1,
    };
    engine = new JudgeEngine(config);
  });

  describe('constructor', () => {
    it('should create engine with required config', () => {
      const eng = new JudgeEngine({ model: 'gpt-4', provider: 'gpt4' });
      expect(eng).toBeDefined();
    });

    it('should accept optional fields', () => {
      const eng = new JudgeEngine({
        model: 'claude-opus',
        provider: 'claude',
        fallbackModels: ['gpt-4-turbo'],
        temperature: 0.5,
        maxTokens: 1024,
        apiKey: 'test-key',
      });
      expect(eng).toBeDefined();
    });
  });

  describe('judge', () => {
    it('should return a faithfulness score', async () => {
      const result = await engine.judge({
        type: 'faithfulness',
        context: 'The user account is john@example.com',
        response: 'Sent reset to john@example.com',
      });

      expect(result).toBeDefined();
      expect(result.score).toBe(0.85);
      expect(result.explanation).toBeDefined();
      expect(result.confidence).toBe(0.9);
      expect(result.calibrated).toBe(false);
    });

    it('should return a relevance score', async () => {
      const result = await engine.judge({
        type: 'relevance',
        intent: 'Reset my password',
        response: 'I can help you reset your password. What is your email?',
      });

      expect(result).toBeDefined();
      expect(result.score).toBe(0.85);
      expect(result.explanation).toBeDefined();
      expect(result.confidence).toBe(0.9);
    });

    it('should return a tool_correctness score', async () => {
      const result = await engine.judge({
        type: 'tool_correctness',
        response: 'Called send_email tool',
        expected_tool: 'send_email',
        actual_tool: 'send_email',
        arguments: { to: 'user@example.com' },
      });

      expect(result).toBeDefined();
      expect(result.score).toBe(0.85);
      expect(result.explanation).toBeDefined();
    });

    it('should return an overall_quality score', async () => {
      const result = await engine.judge({
        type: 'overall_quality',
        context: 'User wants password reset',
        intent: 'Reset password',
        response: 'I have sent a password reset link to your email.',
      });

      expect(result).toBeDefined();
      expect(result.score).toBe(0.85);
    });

    it('should always return score between 0 and 1', async () => {
      const result = await engine.judge({
        type: 'faithfulness',
        context: 'Some context',
        response: 'Some response',
      });

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should not set rawScore by default', async () => {
      const result = await engine.judge({
        type: 'faithfulness',
        context: 'ctx',
        response: 'resp',
      });

      expect(result.rawScore).toBeUndefined();
    });
  });

  describe('judgeBatch', () => {
    it('should process multiple requests', async () => {
      const requests = [
        {
          id: 's1',
          request: { type: 'faithfulness' as const, context: 'ctx1', response: 'resp1' },
        },
        { id: 's2', request: { type: 'relevance' as const, intent: 'intent2', response: 'resp2' } },
        { id: 's3', request: { type: 'overall_quality' as const, response: 'resp3' } },
      ];

      const result: BatchJudgeResult = await engine.judgeBatch(requests);

      expect(result).toBeDefined();
      expect(result.runId).toBeDefined();
      expect(result.totalSamples).toBe(3);
      expect(result.completedSamples).toBe(3);
      expect(result.failedSamples).toBe(0);
      expect(result.results).toHaveLength(3);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should return correct sample IDs in results', async () => {
      const requests = [
        { id: 'sample-a', request: { type: 'faithfulness' as const, response: 'r1' } },
        { id: 'sample-b', request: { type: 'faithfulness' as const, response: 'r2' } },
      ];

      const result = await engine.judgeBatch(requests);

      expect(result.results[0]?.sampleId).toBe('sample-a');
      expect(result.results[1]?.sampleId).toBe('sample-b');
    });

    it('should accept concurrency parameter', async () => {
      const requests = [
        { id: 's1', request: { type: 'faithfulness' as const, response: 'r1' } },
        { id: 's2', request: { type: 'faithfulness' as const, response: 'r2' } },
      ];

      const result = await engine.judgeBatch(requests, 1);

      expect(result.totalSamples).toBe(2);
      expect(result.completedSamples).toBe(2);
    });

    it('should record scores for each sample', async () => {
      const requests = [{ id: 's1', request: { type: 'faithfulness' as const, response: 'r1' } }];

      const result = await engine.judgeBatch(requests);

      expect(result.results[0]?.score.score).toBe(0.85);
      expect(result.results[0]?.score.explanation).toBeDefined();
      expect(result.results[0]?.error).toBeUndefined();
    });
  });
});

describe('ConsensusEngine', () => {
  function makeScore(score: number): JudgeScore {
    return { score, explanation: `score ${score}`, confidence: 0.9, calibrated: false };
  }

  const defaultConfig = {
    enabled: true,
    models: [
      { id: 'claude-opus', weight: 0.5 },
      { id: 'gpt-4-turbo', weight: 0.3 },
      { id: 'gemini-pro', weight: 0.2 },
    ],
    votingStrategy: 'weighted' as const,
    minAgreement: 0.7,
    tieBreaker: 'highest_confidence' as const,
  };

  describe('constructor', () => {
    it('should create engine with config', () => {
      const engine = new ConsensusEngine(defaultConfig);
      expect(engine).toBeDefined();
    });

    it('should create engine with disabled consensus', () => {
      const engine = new ConsensusEngine({ ...defaultConfig, enabled: false });
      expect(engine).toBeDefined();
    });
  });

  describe('consensus - disabled', () => {
    it('should return first score when consensus disabled', () => {
      const engine = new ConsensusEngine({ ...defaultConfig, enabled: false });
      const scores = [
        { model: 'claude-opus', score: makeScore(0.9) },
        { model: 'gpt-4-turbo', score: makeScore(0.5) },
      ];
      const result = engine.consensus(scores);
      expect(result.score).toBe(0.9);
      expect(result.consensusReached).toBe(true);
      expect(result.agreement).toBe(1);
    });

    it('should return 0 for empty scores when disabled', () => {
      const engine = new ConsensusEngine({ ...defaultConfig, enabled: false });
      const result = engine.consensus([]);
      expect(result.score).toBe(0);
    });
  });

  describe('consensus - weighted voting', () => {
    it('should compute weighted average', () => {
      const engine = new ConsensusEngine(defaultConfig);
      const scores = [
        { model: 'claude-opus', score: makeScore(0.9) },
        { model: 'gpt-4-turbo', score: makeScore(0.7) },
        { model: 'gemini-pro', score: makeScore(0.5) },
      ];
      const result = engine.consensus(scores);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.individualScores).toHaveLength(3);
    });

    it('should reach consensus when scores agree', () => {
      const engine = new ConsensusEngine(defaultConfig);
      const scores = [
        { model: 'claude-opus', score: makeScore(0.85) },
        { model: 'gpt-4-turbo', score: makeScore(0.87) },
        { model: 'gemini-pro', score: makeScore(0.86) },
      ];
      const result = engine.consensus(scores);
      expect(result.consensusReached).toBe(true);
    });

    it('should not reach consensus when scores diverge', () => {
      const engine = new ConsensusEngine({ ...defaultConfig, minAgreement: 0.9 });
      const scores = [
        { model: 'claude-opus', score: makeScore(0.1) },
        { model: 'gpt-4-turbo', score: makeScore(0.9) },
        { model: 'gemini-pro', score: makeScore(0.5) },
      ];
      const result = engine.consensus(scores);
      expect(result.consensusReached).toBe(false);
    });

    it('should use weight 1 for unknown models', () => {
      const engine = new ConsensusEngine(defaultConfig);
      const scores = [
        { model: 'unknown-model', score: makeScore(0.8) },
        { model: 'another-unknown', score: makeScore(0.6) },
      ];
      const result = engine.consensus(scores);
      expect(result.score).toBe(0.7);
    });

    it('should use default weight for unknown models', () => {
      const engine = new ConsensusEngine({ ...defaultConfig, models: [] });
      const scores = [{ model: 'x', score: makeScore(0.8) }];
      const result = engine.consensus(scores);
      expect(result.score).toBe(0.8);
    });
  });

  describe('consensus - majority voting', () => {
    const majorityConfig = {
      ...defaultConfig,
      votingStrategy: 'majority' as const,
    };

    it('should return low bin score when majority low', () => {
      const engine = new ConsensusEngine(majorityConfig);
      const scores = [
        { model: 'claude-opus', score: makeScore(0.1) },
        { model: 'gpt-4-turbo', score: makeScore(0.2) },
        { model: 'gemini-pro', score: makeScore(0.9) },
      ];
      const result = engine.consensus(scores);
      expect(result.score).toBe(0.17);
    });

    it('should return medium bin score when majority medium', () => {
      const engine = new ConsensusEngine(majorityConfig);
      const scores = [
        { model: 'claude-opus', score: makeScore(0.5) },
        { model: 'gpt-4-turbo', score: makeScore(0.4) },
        { model: 'gemini-pro', score: makeScore(0.2) },
      ];
      const result = engine.consensus(scores);
      expect(result.score).toBe(0.5);
    });

    it('should return high bin score when majority high', () => {
      const engine = new ConsensusEngine(majorityConfig);
      const scores = [
        { model: 'claude-opus', score: makeScore(0.9) },
        { model: 'gpt-4-turbo', score: makeScore(0.8) },
        { model: 'gemini-pro', score: makeScore(0.3) },
      ];
      const result = engine.consensus(scores);
      expect(result.score).toBe(0.83);
    });
  });

  describe('consensus - unweighted voting', () => {
    const unweightedConfig = {
      ...defaultConfig,
      votingStrategy: 'unweighted' as const,
    };

    it('should compute simple average', () => {
      const engine = new ConsensusEngine(unweightedConfig);
      const scores = [
        { model: 'claude-opus', score: makeScore(0.6) },
        { model: 'gpt-4-turbo', score: makeScore(0.8) },
      ];
      const result = engine.consensus(scores);
      expect(result.score).toBe(0.7);
    });
  });

  describe('consensus - agreement calculation', () => {
    it('should return agreement 1 for single score', () => {
      const engine = new ConsensusEngine({ ...defaultConfig, enabled: false });
      const result = engine.consensus([{ model: 'x', score: makeScore(0.5) }]);
      expect(result.agreement).toBe(1);
    });

    it('should report agreement level', () => {
      const engine = new ConsensusEngine(defaultConfig);
      const scores = [
        { model: 'claude-opus', score: makeScore(0.8) },
        { model: 'gpt-4-turbo', score: makeScore(0.82) },
      ];
      const result = engine.consensus(scores);
      expect(result.agreement).toBeGreaterThan(0.9);
    });
  });
});
