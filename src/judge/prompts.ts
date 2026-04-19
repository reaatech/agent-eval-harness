/**
 * Prompt template variables
 */
export interface PromptVariables {
  context?: string;
  intent?: string;
  response: string;
  expected_tool?: string;
  actual_tool?: string;
  arguments?: Record<string, unknown>;
  rubric?: string;
  examples?: string;
}

/**
 * Prompt template
 */
export interface PromptTemplate {
  /** Template name */
  name: string;
  /** System prompt */
  system: string;
  /** User prompt template */
  user: string;
  /** Response format description */
  responseFormat: string;
}

/**
 * Get faithfulness scoring prompt template
 */
export function getFaithfulnessTemplate(): PromptTemplate {
  return {
    name: 'faithfulness',
    system: `You are an expert evaluator assessing whether an AI assistant's response is faithful to the provided context.

Your task is to determine if the response:
1. Only uses information that can be found in the context
2. Does not add unsupported claims or details
3. Does not contradict the context
4. Accurately represents the information provided`,

    user: `Context:
${'{context}'}

Assistant Response:
${'{response}'}

Rate the faithfulness on a scale from 0.0 to 1.0:
- 1.0: Completely faithful - response only uses information from context
- 0.8: Mostly faithful - minor additions not in context but not contradictory
- 0.6: Somewhat faithful - some information from outside context
- 0.4: Slightly faithful - mostly uses information outside context
- 0.2: Not faithful - contradicts context significantly
- 0.0: Completely unfaithful - entirely fabricated or contradictory

{rubric}

Provide your response in this exact JSON format:
{responseFormat}

Examples of faithful vs unfaithful responses:
{examples}

Now evaluate the response above.`
      .replace('${context}', '{context}')
      .replace('${response}', '{response}')
      .replace('${rubric}', '{rubric}')
      .replace('${examples}', '{examples}'),

    responseFormat: `{
  "score": <number between 0.0 and 1.0>,
  "explanation": "<1-2 sentence explanation>",
  "confidence": <number between 0.0 and 1.0>
}`,
  };
}

/**
 * Get relevance scoring prompt template
 */
export function getRelevanceTemplate(): PromptTemplate {
  return {
    name: 'relevance',
    system: `You are an expert evaluator assessing whether an AI assistant's response is relevant to the user's intent.

Your task is to determine if the response:
1. Directly addresses the user's query or intent
2. Provides useful and on-topic information
3. Does not go off on tangents
4. Matches the expected response type (e.g., answer vs question)`,

    user: `User Intent:
${'{intent}'}

Assistant Response:
${'{response}'}

Rate the relevance on a scale from 0.0 to 1.0:
- 1.0: Perfectly relevant - directly and completely addresses intent
- 0.8: Very relevant - addresses intent with minor tangents
- 0.6: Somewhat relevant - partially addresses intent
- 0.4: Slightly relevant - mostly off-topic
- 0.2: Barely relevant - minimal connection to intent
- 0.0: Completely irrelevant - no relation to intent

{rubric}

Provide your response in this exact JSON format:
{responseFormat}

Now evaluate the response above.`
      .replace('{intent}', '{intent}')
      .replace('${response}', '{response}')
      .replace('${rubric}', '{rubric}')
      .replace('${responseFormat}', '{responseFormat}'),

    responseFormat: `{
  "score": <number between 0.0 and 1.0>,
  "explanation": "<1-2 sentence explanation>",
  "confidence": <number between 0.0 and 1.0>
}`,
  };
}

/**
 * Get tool correctness prompt template
 */
export function getToolCorrectnessTemplate(): PromptTemplate {
  return {
    name: 'tool_correctness',
    system: `You are an expert evaluator assessing whether an AI assistant selected the correct tool and used it properly.

Your task is to determine if:
1. The correct tool was selected for the task
2. The arguments passed to the tool are correct and complete
3. The tool was used in the right context
4. The tool result was interpreted correctly`,

    user: `Expected Tool: ${'{expected_tool}'}
Actual Tool: ${'{actual_tool}'}
Arguments: ${'{arguments}'}

{rubric}

Rate the tool correctness on a scale from 0.0 to 1.0:
- 1.0: Perfect - correct tool with perfect arguments
- 0.8: Good - correct tool with minor argument issues
- 0.6: Acceptable - correct tool but significant argument issues
- 0.4: Poor - wrong tool but reasonable reasoning
- 0.2: Bad - wrong tool with poor reasoning
- 0.0: Terrible - completely wrong tool and usage

Provide your response in this exact JSON format:
${'{responseFormat}'}

Now evaluate the tool usage above.`
      .replace('${expected_tool}', '{expected_tool}')
      .replace('${actual_tool}', '{actual_tool}')
      .replace('${arguments}', '{arguments}')
      .replace('${rubric}', '{rubric}')
      .replace('${responseFormat}', '{responseFormat}'),

    responseFormat: `{
  "score": <number between 0.0 and 1.0>,
  "explanation": "<1-2 sentence explanation>",
  "confidence": <number between 0.0 and 1.0>,
  "issues": ["<list any issues found>"]
}`,
  };
}

/**
 * Get overall quality prompt template
 */
export function getOverallQualityTemplate(): PromptTemplate {
  return {
    name: 'overall_quality',
    system: `You are an expert evaluator assessing the overall quality of an AI assistant's response.

Your task is to provide a holistic quality assessment considering:
1. Accuracy and correctness of information
2. Completeness of the response
3. Clarity and coherence
4. Helpfulness and actionability
5. Appropriate tone and style
6. Proper use of tools (if applicable)`,

    user: `Context:
${'{context}'}

User Intent:
${'{intent}'}

Assistant Response:
${'{response}'}

{rubric}

Rate the overall quality on a scale from 0.0 to 1.0:
- 1.0: Excellent - exceeds expectations in all dimensions
- 0.8: Good - meets expectations with minor issues
- 0.6: Acceptable - meets basic expectations
- 0.4: Below Average - has significant issues
- 0.2: Poor - fails to meet expectations
- 0.0: Unacceptable - completely inadequate

Provide your response in this exact JSON format:
${'{responseFormat}'}

Now evaluate the response above.`
      .replace('${context}', '{context}')
      .replace('${intent}', '{intent}')
      .replace('${response}', '{response}')
      .replace('${rubric}', '{rubric}')
      .replace('${responseFormat}', '{responseFormat}'),

    responseFormat: `{
  "score": <number between 0.0 and 1.0>,
  "explanation": "<2-3 sentence explanation covering key dimensions>",
  "confidence": <number between 0.0 and 1.0>,
  "dimensionScores": {
    "accuracy": <0.0-1.0>,
    "completeness": <0.0-1.0>,
    "clarity": <0.0-1.0>,
    "helpfulness": <0.0-1.0>
  }
}`,
  };
}

/**
 * Build prompt from template and variables
 */
export function buildPrompt(
  template: PromptTemplate,
  variables: PromptVariables,
): { system: string; user: string } {
  const systemPrompt = template.system;
  let userPrompt = template.user;

  // Replace variables in user prompt
  if (variables.context !== undefined) {
    userPrompt = userPrompt.replace('{context}', variables.context);
  }
  if (variables.intent !== undefined) {
    userPrompt = userPrompt.replace('{intent}', variables.intent);
  }
  if (variables.response !== undefined) {
    userPrompt = userPrompt.replace('{response}', variables.response);
  }
  if (variables.expected_tool !== undefined) {
    userPrompt = userPrompt.replace('{expected_tool}', variables.expected_tool);
  }
  if (variables.actual_tool !== undefined) {
    userPrompt = userPrompt.replace('{actual_tool}', variables.actual_tool);
  }
  if (variables.arguments !== undefined) {
    userPrompt = userPrompt.replace('{arguments}', JSON.stringify(variables.arguments, null, 2));
  }
  if (variables.rubric !== undefined) {
    userPrompt = userPrompt.replace('{rubric}', variables.rubric);
  }
  if (variables.examples !== undefined) {
    userPrompt = userPrompt.replace('{examples}', variables.examples);
  }

  // Replace response format placeholder
  userPrompt = userPrompt.replace('{responseFormat}', template.responseFormat);

  return { system: systemPrompt, user: userPrompt };
}

/**
 * Get all available templates
 */
export function getAvailableTemplates(): Record<string, PromptTemplate> {
  return {
    faithfulness: getFaithfulnessTemplate(),
    relevance: getRelevanceTemplate(),
    tool_correctness: getToolCorrectnessTemplate(),
    overall_quality: getOverallQualityTemplate(),
  };
}

/**
 * Create a custom prompt template
 */
export function createCustomTemplate(config: {
  name: string;
  system: string;
  user: string;
  responseFormat: string;
}): PromptTemplate {
  return {
    name: config.name,
    system: config.system,
    user: config.user,
    responseFormat: config.responseFormat,
  };
}
