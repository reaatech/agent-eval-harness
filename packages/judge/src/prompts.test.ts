import { describe, expect, it } from 'vitest';
import {
  buildPrompt,
  createCustomTemplate,
  getAvailableTemplates,
  getFaithfulnessTemplate,
  getOverallQualityTemplate,
  getRelevanceTemplate,
  getToolCorrectnessTemplate,
} from './prompts.js';
import type { PromptTemplate, PromptVariables } from './prompts.js';

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
