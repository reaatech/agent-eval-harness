import { beforeEach, describe, expect, it } from 'vitest';
import { ConsensusEngine, JudgeCalibrator } from '../../src/judge/calibration.js';
import type {
  CalibrationResult,
  ConsensusConfig,
  HumanLabel,
} from '../../src/judge/calibration.js';
import {
  JudgeCostTracker,
  estimateOutputTokens,
  estimateTokens,
} from '../../src/judge/cost-tracker.js';
import { JudgeEngine } from '../../src/judge/engine.js';
import type { BatchJudgeResult, JudgeConfig, JudgeScore } from '../../src/judge/engine.js';
import {
  buildPrompt,
  createCustomTemplate,
  getAvailableTemplates,
  getFaithfulnessTemplate,
  getOverallQualityTemplate,
  getRelevanceTemplate,
  getToolCorrectnessTemplate,
} from '../../src/judge/prompts.js';
import type { PromptTemplate, PromptVariables } from '../../src/judge/prompts.js';

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

describe('JudgeCalibrator', () => {
  let calibrator: JudgeCalibrator;

  beforeEach(() => {
    calibrator = new JudgeCalibrator();
  });

  describe('constructor', () => {
    it('should default to temperature_scaling method', () => {
      const c = new JudgeCalibrator();
      expect(c).toBeDefined();
      expect(c.getIsCalibrated()).toBe(false);
    });

    it('should accept calibration method', () => {
      const c = new JudgeCalibrator('isotonic_regression');
      expect(c).toBeDefined();
    });

    it('should accept linear method', () => {
      const c = new JudgeCalibrator('linear');
      expect(c).toBeDefined();
    });
  });

  describe('addCalibrationData', () => {
    it('should accept human labels and judge scores', () => {
      const humanLabels: HumanLabel[] = [
        { sampleId: '1', score: 0.8, type: 'faithfulness' },
        { sampleId: '2', score: 0.6, type: 'faithfulness' },
      ];
      const judgeScores: JudgeScore[] = [
        { score: 0.75, explanation: 'test', confidence: 0.9, calibrated: false, rawScore: 0.7 },
        { score: 0.55, explanation: 'test', confidence: 0.8, calibrated: false, rawScore: 0.5 },
      ];

      expect(() => calibrator.addCalibrationData(humanLabels, judgeScores)).not.toThrow();
    });

    it('should match judge scores with rawScore defined', () => {
      const humanLabels: HumanLabel[] = [
        { sampleId: '1', score: 0.9, type: 'relevance' },
        { sampleId: '2', score: 0.7, type: 'relevance' },
        { sampleId: '3', score: 0.5, type: 'relevance' },
      ];
      const judgeScores: JudgeScore[] = [
        { score: 0.85, explanation: 'e1', confidence: 0.9, calibrated: false, rawScore: 0.85 },
        { score: 0.65, explanation: 'e2', confidence: 0.8, calibrated: false, rawScore: 0.65 },
        { score: 0.45, explanation: 'e3', confidence: 0.7, calibrated: false, rawScore: 0.45 },
      ];

      calibrator.addCalibrationData(humanLabels, judgeScores);
      const result = calibrator.calibrate();

      expect(result.sampleCount).toBe(3);
    });
  });

  describe('calibrate', () => {
    it('should calibrate with temperature_scaling', () => {
      const humanLabels: HumanLabel[] = [
        { sampleId: '1', score: 0.8, type: 'faithfulness' },
        { sampleId: '2', score: 0.6, type: 'faithfulness' },
        { sampleId: '3', score: 0.9, type: 'faithfulness' },
        { sampleId: '4', score: 0.4, type: 'faithfulness' },
      ];
      const judgeScores: JudgeScore[] = [
        { score: 0.75, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.7 },
        { score: 0.55, explanation: 'e', confidence: 0.8, calibrated: false, rawScore: 0.5 },
        { score: 0.85, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.85 },
        { score: 0.35, explanation: 'e', confidence: 0.7, calibrated: false, rawScore: 0.35 },
      ];

      calibrator.addCalibrationData(humanLabels, judgeScores);
      const result: CalibrationResult = calibrator.calibrate();

      expect(result.method).toBe('temperature_scaling');
      expect(result.sampleCount).toBe(4);
      expect(result.beforeMAE).toBeGreaterThanOrEqual(0);
      expect(result.afterMAE).toBeGreaterThanOrEqual(0);
      expect(result.improvement).toBeDefined();
      expect(result.parameters).toBeDefined();
      expect(result.parameters.temperature).toBeDefined();
    });

    it('should calibrate with isotonic_regression', () => {
      const c = new JudgeCalibrator('isotonic_regression');
      const humanLabels: HumanLabel[] = [
        { sampleId: '1', score: 0.9, type: 'relevance' },
        { sampleId: '2', score: 0.7, type: 'relevance' },
        { sampleId: '3', score: 0.3, type: 'relevance' },
      ];
      const judgeScores: JudgeScore[] = [
        { score: 0.85, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.85 },
        { score: 0.65, explanation: 'e', confidence: 0.8, calibrated: false, rawScore: 0.65 },
        { score: 0.35, explanation: 'e', confidence: 0.7, calibrated: false, rawScore: 0.35 },
      ];

      c.addCalibrationData(humanLabels, judgeScores);
      const result = c.calibrate();

      expect(result.method).toBe('isotonic_regression');
      expect(result.sampleCount).toBe(3);
      expect(result.parameters.scale).toBeDefined();
      expect(result.parameters.offset).toBeDefined();
    });

    it('should calibrate with linear method', () => {
      const c = new JudgeCalibrator('linear');
      const humanLabels: HumanLabel[] = [
        { sampleId: '1', score: 0.8, type: 'quality' },
        { sampleId: '2', score: 0.5, type: 'quality' },
        { sampleId: '3', score: 0.2, type: 'quality' },
      ];
      const judgeScores: JudgeScore[] = [
        { score: 0.75, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.75 },
        { score: 0.45, explanation: 'e', confidence: 0.8, calibrated: false, rawScore: 0.45 },
        { score: 0.15, explanation: 'e', confidence: 0.7, calibrated: false, rawScore: 0.15 },
      ];

      c.addCalibrationData(humanLabels, judgeScores);
      const result = c.calibrate();

      expect(result.method).toBe('linear');
      expect(result.sampleCount).toBe(3);
      expect(result.parameters.slope).toBeDefined();
      expect(result.parameters.intercept).toBeDefined();
    });

    it('should throw if fewer than 3 calibration points', () => {
      const humanLabels: HumanLabel[] = [{ sampleId: '1', score: 0.8, type: 'faithfulness' }];
      const judgeScores: JudgeScore[] = [
        { score: 0.75, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.7 },
      ];

      calibrator.addCalibrationData(humanLabels, judgeScores);
      expect(() => calibrator.calibrate()).toThrow('Need at least 3 calibration points');
    });

    it('should throw with no calibration data', () => {
      expect(() => calibrator.calibrate()).toThrow('Need at least 3 calibration points');
    });

    it('should set calibrated state to true after calibrate', () => {
      const humanLabels: HumanLabel[] = [
        { sampleId: '1', score: 0.8, type: 'faithfulness' },
        { sampleId: '2', score: 0.6, type: 'faithfulness' },
        { sampleId: '3', score: 0.9, type: 'faithfulness' },
      ];
      const judgeScores: JudgeScore[] = [
        { score: 0.75, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.7 },
        { score: 0.55, explanation: 'e', confidence: 0.8, calibrated: false, rawScore: 0.5 },
        { score: 0.85, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.85 },
      ];

      calibrator.addCalibrationData(humanLabels, judgeScores);
      expect(calibrator.getIsCalibrated()).toBe(false);

      calibrator.calibrate();
      expect(calibrator.getIsCalibrated()).toBe(true);
    });
  });

  describe('apply', () => {
    it('should return raw score when not calibrated', () => {
      expect(calibrator.apply(0.75)).toBe(0.75);
    });

    it('should return raw score when not calibrated for edge values', () => {
      expect(calibrator.apply(0)).toBe(0);
      expect(calibrator.apply(1)).toBe(1);
    });

    it('should return calibrated score after calibration', () => {
      const humanLabels: HumanLabel[] = [
        { sampleId: '1', score: 0.8, type: 'faithfulness' },
        { sampleId: '2', score: 0.6, type: 'faithfulness' },
        { sampleId: '3', score: 0.9, type: 'faithfulness' },
        { sampleId: '4', score: 0.4, type: 'faithfulness' },
        { sampleId: '5', score: 0.7, type: 'faithfulness' },
      ];
      const judgeScores: JudgeScore[] = [
        { score: 0.75, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.7 },
        { score: 0.55, explanation: 'e', confidence: 0.8, calibrated: false, rawScore: 0.5 },
        { score: 0.85, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.85 },
        { score: 0.35, explanation: 'e', confidence: 0.7, calibrated: false, rawScore: 0.35 },
        { score: 0.65, explanation: 'e', confidence: 0.8, calibrated: false, rawScore: 0.65 },
      ];

      calibrator.addCalibrationData(humanLabels, judgeScores);
      calibrator.calibrate();

      const result = calibrator.apply(0.75);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    });

    it('should produce different output than input when calibrated', () => {
      const humanLabels: HumanLabel[] = [
        { sampleId: '1', score: 0.9, type: 'relevance' },
        { sampleId: '2', score: 0.3, type: 'relevance' },
        { sampleId: '3', score: 0.6, type: 'relevance' },
        { sampleId: '4', score: 0.1, type: 'relevance' },
      ];
      const judgeScores: JudgeScore[] = [
        { score: 0.85, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.8 },
        { score: 0.35, explanation: 'e', confidence: 0.8, calibrated: false, rawScore: 0.3 },
        { score: 0.55, explanation: 'e', confidence: 0.7, calibrated: false, rawScore: 0.5 },
        { score: 0.15, explanation: 'e', confidence: 0.6, calibrated: false, rawScore: 0.1 },
      ];

      calibrator.addCalibrationData(humanLabels, judgeScores);
      calibrator.calibrate();

      const result = calibrator.apply(0.5);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    });

    it('should clamp output to 0-1 range', () => {
      const humanLabels: HumanLabel[] = [
        { sampleId: '1', score: 0.8, type: 'faithfulness' },
        { sampleId: '2', score: 0.6, type: 'faithfulness' },
        { sampleId: '3', score: 0.9, type: 'faithfulness' },
      ];
      const judgeScores: JudgeScore[] = [
        { score: 0.75, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.7 },
        { score: 0.55, explanation: 'e', confidence: 0.8, calibrated: false, rawScore: 0.5 },
        { score: 0.85, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.85 },
      ];

      calibrator.addCalibrationData(humanLabels, judgeScores);
      calibrator.calibrate();

      expect(calibrator.apply(0)).toBeGreaterThanOrEqual(0);
      expect(calibrator.apply(1)).toBeLessThanOrEqual(1);
    });
  });

  describe('getIsCalibrated', () => {
    it('should return false before calibration', () => {
      expect(calibrator.getIsCalibrated()).toBe(false);
    });

    it('should return true after successful calibration', () => {
      const humanLabels: HumanLabel[] = [
        { sampleId: '1', score: 0.8, type: 'faithfulness' },
        { sampleId: '2', score: 0.6, type: 'faithfulness' },
        { sampleId: '3', score: 0.9, type: 'faithfulness' },
      ];
      const judgeScores: JudgeScore[] = [
        { score: 0.75, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.7 },
        { score: 0.55, explanation: 'e', confidence: 0.8, calibrated: false, rawScore: 0.5 },
        { score: 0.85, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.85 },
      ];

      calibrator.addCalibrationData(humanLabels, judgeScores);
      calibrator.calibrate();
      expect(calibrator.getIsCalibrated()).toBe(true);
    });
  });
});

describe('Prompts', () => {
  describe('getFaithfulnessTemplate', () => {
    it('should return a prompt template for faithfulness', () => {
      const template: PromptTemplate = getFaithfulnessTemplate();

      expect(template.name).toBe('faithfulness');
      expect(template.system).toBeDefined();
      expect(template.user).toBeDefined();
      expect(template.responseFormat).toBeDefined();
      expect(template.system).toContain('faithful');
      expect(template.user).toContain('{context}');
      expect(template.user).toContain('{response}');
    });
  });

  describe('getRelevanceTemplate', () => {
    it('should return a prompt template for relevance', () => {
      const template: PromptTemplate = getRelevanceTemplate();

      expect(template.name).toBe('relevance');
      expect(template.system).toContain('relevant');
      expect(template.user).toContain('{intent}');
      expect(template.user).toContain('{response}');
    });
  });

  describe('getToolCorrectnessTemplate', () => {
    it('should return a prompt template for tool correctness', () => {
      const template: PromptTemplate = getToolCorrectnessTemplate();

      expect(template.name).toBe('tool_correctness');
      expect(template.user).toContain('{expected_tool}');
      expect(template.user).toContain('{actual_tool}');
      expect(template.user).toContain('{arguments}');
    });
  });

  describe('getOverallQualityTemplate', () => {
    it('should return a prompt template for overall quality', () => {
      const template: PromptTemplate = getOverallQualityTemplate();

      expect(template.name).toBe('overall_quality');
      expect(template.user).toContain('{context}');
      expect(template.user).toContain('{intent}');
      expect(template.user).toContain('{response}');
    });
  });

  describe('buildPrompt', () => {
    it('should substitute variables in faithfulness template', () => {
      const template = getFaithfulnessTemplate();
      const variables: PromptVariables = {
        context: 'The capital of France is Paris.',
        response: 'Paris is the capital of France.',
      };

      const result = buildPrompt(template, variables);

      expect(result.system).toBe(template.system);
      expect(result.user).toContain('The capital of France is Paris.');
      expect(result.user).toContain('Paris is the capital of France.');
      expect(result.user).not.toContain('{context}');
      expect(result.user).not.toContain('{response}');
    });

    it('should substitute variables in relevance template', () => {
      const template = getRelevanceTemplate();
      const variables: PromptVariables = {
        intent: 'What is the weather?',
        response: 'It is sunny today.',
      };

      const result = buildPrompt(template, variables);

      expect(result.user).toContain('What is the weather?');
      expect(result.user).toContain('It is sunny today.');
    });

    it('should substitute tool correctness variables', () => {
      const template = getToolCorrectnessTemplate();
      const variables: PromptVariables = {
        response: 'Called search',
        expected_tool: 'search',
        actual_tool: 'search',
        arguments: { query: 'weather' },
      };

      const result = buildPrompt(template, variables);

      expect(result.user).toContain('search');
      expect(result.user).toContain('"query": "weather"');
    });

    it('should substitute rubric when provided', () => {
      const template = getFaithfulnessTemplate();
      const variables: PromptVariables = {
        context: 'Some context',
        response: 'Some response',
        rubric: 'Use strict grading criteria',
      };

      const result = buildPrompt(template, variables);

      expect(result.user).toContain('Use strict grading criteria');
    });

    it('should substitute examples when provided', () => {
      const template = getFaithfulnessTemplate();
      const variables: PromptVariables = {
        context: 'ctx',
        response: 'resp',
        examples: 'Example: good response = 1.0',
      };

      const result = buildPrompt(template, variables);

      expect(result.user).toContain('Example: good response = 1.0');
    });

    it('should replace responseFormat placeholder', () => {
      const template = getFaithfulnessTemplate();
      const variables: PromptVariables = {
        response: 'test',
      };

      const result = buildPrompt(template, variables);

      expect(result.user).toContain('"score"');
      expect(result.user).toContain('"explanation"');
      expect(result.user).toContain('"confidence"');
    });

    it('should substitute all variables in overall quality template', () => {
      const template = getOverallQualityTemplate();
      const variables: PromptVariables = {
        context: 'User context info',
        intent: 'User wants help',
        response: 'Here is my response',
        rubric: 'Custom rubric',
      };

      const result = buildPrompt(template, variables);

      expect(result.user).toContain('User context info');
      expect(result.user).toContain('User wants help');
      expect(result.user).toContain('Here is my response');
      expect(result.user).toContain('Custom rubric');
    });
  });

  describe('getAvailableTemplates', () => {
    it('should return all four templates', () => {
      const templates = getAvailableTemplates();

      expect(templates.faithfulness).toBeDefined();
      expect(templates.relevance).toBeDefined();
      expect(templates.tool_correctness).toBeDefined();
      expect(templates.overall_quality).toBeDefined();
      expect(Object.keys(templates)).toHaveLength(4);
    });

    it('should return valid PromptTemplate objects', () => {
      const templates = getAvailableTemplates();

      for (const key of Object.keys(templates)) {
        expect(templates[key]?.name).toBeDefined();
        expect(templates[key]?.system).toBeDefined();
        expect(templates[key]?.user).toBeDefined();
        expect(templates[key]?.responseFormat).toBeDefined();
      }
    });
  });

  describe('createCustomTemplate', () => {
    it('should create a template with provided config', () => {
      const template = createCustomTemplate({
        name: 'custom_eval',
        system: 'You are a custom evaluator.',
        user: 'Evaluate {{response}} for {{intent}}',
        responseFormat: '{"score": 0.0-1.0}',
      });

      expect(template.name).toBe('custom_eval');
      expect(template.system).toBe('You are a custom evaluator.');
      expect(template.user).toBe('Evaluate {{response}} for {{intent}}');
      expect(template.responseFormat).toBe('{"score": 0.0-1.0}');
    });

    it('should create different templates for different configs', () => {
      const t1 = createCustomTemplate({
        name: 'a',
        system: 'system a',
        user: 'user a',
        responseFormat: 'fmt a',
      });
      const t2 = createCustomTemplate({
        name: 'b',
        system: 'system b',
        user: 'user b',
        responseFormat: 'fmt b',
      });

      expect(t1.name).not.toBe(t2.name);
      expect(t1.system).not.toBe(t2.system);
    });
  });
});

describe('JudgeCostTracker', () => {
  let tracker: JudgeCostTracker;

  beforeEach(() => {
    tracker = new JudgeCostTracker();
  });

  describe('constructor', () => {
    it('should create tracker with default config', () => {
      const t = new JudgeCostTracker();
      expect(t).toBeDefined();
      expect(t.getTotalCost()).toBe(0);
    });

    it('should accept budget limit', () => {
      const t = new JudgeCostTracker({ budgetLimit: 10.0 });
      expect(t.getRemainingBudget()).toBe(10.0);
    });

    it('should accept custom pricing', () => {
      const t = new JudgeCostTracker({
        pricing: {
          claude: { input: 20.0, output: 80.0 },
          gpt4: { input: 15.0, output: 45.0 },
          gemini: { input: 3.0, output: 9.0 },
          openrouter: { input: 6.0, output: 18.0 },
        },
      });
      expect(t).toBeDefined();
    });
  });

  describe('recordJudgment', () => {
    it('should record a judgment cost', () => {
      const result = tracker.recordJudgment('j1', 'claude', 'claude-opus', 1000, 500);

      expect(result.cost).toBeGreaterThan(0);
      expect(result.alerts).toBeDefined();
      expect(result.alerts).toHaveLength(0);
    });

    it('should calculate cost based on pricing', () => {
      const result = tracker.recordJudgment('j1', 'claude', 'claude-opus', 1000, 500);

      const expectedCost = (1000 * 15.0 + 500 * 75.0) / 1_000_000;
      expect(result.cost).toBeCloseTo(expectedCost, 4);
    });

    it('should track total cost across judgments', () => {
      tracker.recordJudgment('j1', 'claude', 'claude-opus', 1000, 500);
      tracker.recordJudgment('j2', 'claude', 'claude-opus', 2000, 1000);

      const total = tracker.getTotalCost();
      expect(total).toBeGreaterThan(0);
    });

    it('should trigger budget alerts', () => {
      const t = new JudgeCostTracker({ budgetLimit: 0.001, alertThresholds: [0.5] });
      const result = t.recordJudgment('j1', 'claude', 'claude-opus', 10000, 5000);

      expect(result.alerts.length).toBeGreaterThan(0);
    });

    it('should trigger max cost per judgment alert', () => {
      const t = new JudgeCostTracker({ maxCostPerJudgment: 0.0001 });
      const result = t.recordJudgment('j1', 'claude', 'claude-opus', 10000, 5000);

      expect(result.alerts.some((a) => a.level === 'warning')).toBe(true);
    });
  });

  describe('estimateCost', () => {
    it('should estimate cost for a provider', () => {
      const cost = tracker.estimateCost('claude', 1000, 500);

      expect(cost).toBeGreaterThan(0);
      const expected = (1000 * 15.0 + 500 * 75.0) / 1_000_000;
      expect(cost).toBeCloseTo(expected, 4);
    });

    it('should return different costs for different providers', () => {
      const claudeCost = tracker.estimateCost('claude', 1000, 500);
      const geminiCost = tracker.estimateCost('gemini', 1000, 500);

      expect(claudeCost).not.toBe(geminiCost);
    });
  });

  describe('canAfford', () => {
    it('should allow when no budget limit set', () => {
      const result = tracker.canAfford(100);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should allow when within budget', () => {
      const t = new JudgeCostTracker({ budgetLimit: 1.0 });
      const result = t.canAfford(0.01);

      expect(result.allowed).toBe(true);
    });

    it('should block when over budget', () => {
      const t = new JudgeCostTracker({ budgetLimit: 0.0001 });
      t.recordJudgment('j1', 'claude', 'claude-opus', 1000, 500);
      const result = t.canAfford(1.0);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
    });
  });

  describe('getBreakdown', () => {
    it('should return empty breakdown initially', () => {
      const breakdown = tracker.getBreakdown();

      expect(breakdown.totalCost).toBe(0);
      expect(breakdown.totalInputTokens).toBe(0);
      expect(breakdown.totalOutputTokens).toBe(0);
      expect(breakdown.judgmentCount).toBe(0);
      expect(breakdown.avgCostPerJudgment).toBe(0);
    });

    it('should return accurate breakdown after recordings', () => {
      tracker.recordJudgment('j1', 'claude', 'claude-opus', 1000, 500);
      tracker.recordJudgment('j2', 'gpt4', 'gpt-4', 2000, 1000);

      const breakdown = tracker.getBreakdown();

      expect(breakdown.totalCost).toBeGreaterThan(0);
      expect(breakdown.totalInputTokens).toBe(3000);
      expect(breakdown.totalOutputTokens).toBe(1500);
      expect(breakdown.judgmentCount).toBe(2);
      expect(breakdown.avgCostPerJudgment).toBeGreaterThan(0);
      expect(breakdown.costByProvider.claude).toBeGreaterThan(0);
      expect(breakdown.costByProvider.gpt4).toBeGreaterThan(0);
    });

    it('should report budget usage percentage', () => {
      const t = new JudgeCostTracker({ budgetLimit: 1.0 });
      t.recordJudgment('j1', 'claude', 'claude-opus', 10000, 5000);

      const breakdown = t.getBreakdown();
      expect(breakdown.budgetUsagePercentage).toBeGreaterThan(0);
    });

    it('should report zero budget usage when no limit set', () => {
      tracker.recordJudgment('j1', 'claude', 'claude-opus', 1000, 500);
      const breakdown = tracker.getBreakdown();
      expect(breakdown.budgetUsagePercentage).toBe(0);
    });
  });

  describe('getJudgments', () => {
    it('should return empty array initially', () => {
      expect(tracker.getJudgments()).toHaveLength(0);
    });

    it('should return all recorded judgments', () => {
      tracker.recordJudgment('j1', 'claude', 'claude-opus', 1000, 500);
      tracker.recordJudgment('j2', 'gpt4', 'gpt-4', 2000, 1000);

      const judgments = tracker.getJudgments();
      expect(judgments).toHaveLength(2);
      expect(judgments[0]?.judgmentId).toBe('j1');
      expect(judgments[1]?.judgmentId).toBe('j2');
    });
  });

  describe('getTotalCost', () => {
    it('should return 0 initially', () => {
      expect(tracker.getTotalCost()).toBe(0);
    });

    it('should accumulate costs', () => {
      const r1 = tracker.recordJudgment('j1', 'claude', 'claude-opus', 1000, 500);
      const r2 = tracker.recordJudgment('j2', 'claude', 'claude-opus', 1000, 500);

      expect(tracker.getTotalCost()).toBeCloseTo(r1.cost + r2.cost, 4);
    });
  });

  describe('reset', () => {
    it('should reset all tracking data', () => {
      tracker.recordJudgment('j1', 'claude', 'claude-opus', 1000, 500);
      tracker.recordJudgment('j2', 'claude', 'claude-opus', 2000, 1000);

      tracker.reset();

      expect(tracker.getTotalCost()).toBe(0);
      expect(tracker.getJudgments()).toHaveLength(0);
    });
  });

  describe('getRemainingBudget', () => {
    it('should return Infinity when no budget set', () => {
      expect(tracker.getRemainingBudget()).toBe(Number.POSITIVE_INFINITY);
    });

    it('should return remaining budget', () => {
      const t = new JudgeCostTracker({ budgetLimit: 1.0 });
      const r = t.recordJudgment('j1', 'claude', 'claude-opus', 1000, 500);

      const remaining = t.getRemainingBudget();
      expect(remaining).toBeCloseTo(1.0 - r.cost, 4);
    });
  });

  describe('getOptimizationRecommendations', () => {
    it('should return empty array when no issues', () => {
      expect(tracker.getOptimizationRecommendations()).toHaveLength(0);
    });

    it('should recommend optimization when budget usage is high', () => {
      const t = new JudgeCostTracker({ budgetLimit: 0.001 });
      t.recordJudgment('j1', 'claude', 'claude-opus', 100000, 50000);

      const recs = t.getOptimizationRecommendations();
      expect(recs.length).toBeGreaterThan(0);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens from text', () => {
      const tokens = estimateTokens('Hello world');
      expect(tokens).toBe(Math.ceil('Hello world'.length / 4));
    });

    it('should return at least 1 for non-empty text', () => {
      const tokens = estimateTokens('a');
      expect(tokens).toBeGreaterThanOrEqual(1);
    });

    it('should return 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });
  });

  describe('estimateOutputTokens', () => {
    it('should return a positive number', () => {
      const tokens = estimateOutputTokens('faithfulness');
      expect(tokens).toBeGreaterThan(0);
    });

    it('should return consistent values regardless of type', () => {
      const t1 = estimateOutputTokens('faithfulness');
      const t2 = estimateOutputTokens('relevance');
      expect(t1).toBe(t2);
    });
  });
});

describe('ConsensusEngine', () => {
  function makeScore(score: number): JudgeScore {
    return { score, explanation: `score ${score}`, confidence: 0.9, calibrated: false };
  }

  const defaultConfig: ConsensusConfig = {
    enabled: true,
    models: [
      { id: 'claude-opus', weight: 0.5 },
      { id: 'gpt-4-turbo', weight: 0.3 },
      { id: 'gemini-pro', weight: 0.2 },
    ],
    votingStrategy: 'weighted',
    minAgreement: 0.7,
    tieBreaker: 'highest_confidence',
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
    const majorityConfig: ConsensusConfig = {
      ...defaultConfig,
      votingStrategy: 'majority',
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
    const unweightedConfig: ConsensusConfig = {
      ...defaultConfig,
      votingStrategy: 'unweighted',
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
