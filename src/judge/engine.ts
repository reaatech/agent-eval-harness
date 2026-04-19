/**
 * Judge provider types
 */
export type JudgeProvider = 'claude' | 'gpt4' | 'gemini' | 'openrouter';

/**
 * Judgment criteria types
 */
export type JudgmentType = 'faithfulness' | 'relevance' | 'tool_correctness' | 'overall_quality';

/**
 * Judge score result
 */
export interface JudgeScore {
  /** Score from 0.0 to 1.0 */
  score: number;
  /** Explanation for the score */
  explanation: string;
  /** Confidence in the score (0.0 to 1.0) */
  confidence: number;
  /** Whether score has been calibrated */
  calibrated: boolean;
  /** Raw score before calibration */
  rawScore?: number;
  /** Cost of this judge call */
  cost?: number;
}

/**
 * Judge request
 */
export interface JudgeRequest {
  /** Type of judgment */
  type: JudgmentType;
  /** Context for evaluation */
  context?: string;
  /** User intent or query */
  intent?: string;
  /** Agent response to evaluate */
  response: string;
  /** Expected tool call (for tool_correctness) */
  expected_tool?: string;
  /** Actual tool call (for tool_correctness) */
  actual_tool?: string;
  /** Tool arguments (for tool_correctness) */
  arguments?: Record<string, unknown>;
}

/**
 * Judge configuration
 */
export interface JudgeConfig {
  /** Primary judge model */
  model: string;
  /** Provider */
  provider: JudgeProvider;
  /** Fallback models */
  fallbackModels?: string[];
  /** Temperature for generation */
  temperature?: number;
  /** Max tokens */
  maxTokens?: number;
  /** API key (from env) */
  apiKey?: string;
}

/**
 * Batch judgment result
 */
export interface BatchJudgeResult {
  /** Run ID */
  runId: string;
  /** Total samples */
  totalSamples: number;
  /** Completed samples */
  completedSamples: number;
  /** Failed samples */
  failedSamples: number;
  /** Results per sample */
  results: Array<{
    sampleId: string;
    score: JudgeScore;
    error?: string;
  }>;
  /** Total cost */
  totalCost: number;
  /** Duration in ms */
  durationMs: number;
}

/**
 * Rate limiter for API calls
 */
class RateLimiter {
  private calls: number[] = [];
  private readonly maxCalls: number;
  private readonly windowMs: number;

  constructor(maxCalls: number, windowMs: number) {
    this.maxCalls = maxCalls;
    this.windowMs = windowMs;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    this.calls = this.calls.filter((t) => now - t < this.windowMs);

    if (this.calls.length >= this.maxCalls) {
      const oldestCall = this.calls[0];
      const waitMs = oldestCall !== undefined ? this.windowMs - (now - oldestCall) : 0;
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }

    this.calls.push(Date.now());
  }
}

/**
 * Default rate limiters per provider
 */
const DEFAULT_RATE_LIMITS: Record<JudgeProvider, { calls: number; window: number }> = {
  claude: { calls: 50, window: 60000 },
  gpt4: { calls: 60, window: 60000 },
  gemini: { calls: 60, window: 60000 },
  openrouter: { calls: 30, window: 60000 },
};

/**
 * LLM Judge Engine
 */
export class JudgeEngine {
  private config: JudgeConfig;
  private rateLimiter: RateLimiter;
  private retryConfig: { maxRetries: number; baseDelayMs: number };

  constructor(config: JudgeConfig, retryConfig = { maxRetries: 3, baseDelayMs: 1000 }) {
    this.config = config;
    const rateLimit = DEFAULT_RATE_LIMITS[config.provider] || DEFAULT_RATE_LIMITS.claude;
    this.rateLimiter = new RateLimiter(rateLimit.calls, rateLimit.window);
    this.retryConfig = retryConfig;
  }

  /**
   * Judge a single request
   */
  async judge(request: JudgeRequest): Promise<JudgeScore> {
    await this.rateLimiter.acquire();

    const prompt = this.buildPrompt(request);

    for (let attempt = 0; attempt < this.retryConfig.maxRetries; attempt++) {
      try {
        const response = await this.callLLM(prompt);
        return this.parseResponse(response);
      } catch (error) {
        if (attempt === this.retryConfig.maxRetries - 1) {
          throw error;
        }
        const delay = this.retryConfig.baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error('All retries failed');
  }

  /**
   * Judge multiple requests in batch
   */
  async judgeBatch(
    requests: Array<{ id: string; request: JudgeRequest }>,
    concurrency = 5,
  ): Promise<BatchJudgeResult> {
    const runId = `judge-${Date.now()}`;
    const startTime = Date.now();
    const results: BatchJudgeResult['results'] = [];
    let totalCost = 0;
    let completed = 0;
    let failed = 0;

    // Process in batches with concurrency limit
    for (let i = 0; i < requests.length; i += concurrency) {
      const batch = requests.slice(i, i + concurrency);
      const promises = batch.map(async ({ id, request }) => {
        try {
          const score = await this.judge(request);
          completed++;
          return { sampleId: id, score };
        } catch (error) {
          failed++;
          return {
            sampleId: id,
            score: this.getFallbackScore(),
            error: (error as Error).message,
          };
        }
      });

      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
      totalCost += batchResults.reduce((sum, r) => sum + (r.score.cost || 0), 0);
    }

    return {
      runId,
      totalSamples: requests.length,
      completedSamples: completed,
      failedSamples: failed,
      results,
      totalCost,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Build prompt for judgment
   */
  private buildPrompt(request: JudgeRequest): string {
    switch (request.type) {
      case 'faithfulness':
        return this.buildFaithfulnessPrompt(request);
      case 'relevance':
        return this.buildRelevancePrompt(request);
      case 'tool_correctness':
        return this.buildToolCorrectnessPrompt(request);
      case 'overall_quality':
        return this.buildOverallQualityPrompt(request);
      default:
        throw new Error(`Unknown judgment type: ${request.type}`);
    }
  }

  /**
   * Build faithfulness prompt
   */
  private buildFaithfulnessPrompt(request: JudgeRequest): string {
    return `You are an evaluator assessing whether an AI assistant's response is faithful to the provided context.

Context: ${request.context || 'N/A'}

Assistant Response: ${request.response}

Rate the faithfulness of the response to the context on a scale from 0.0 to 1.0, where:
- 1.0: Response is completely faithful, only using information from the context
- 0.5: Response is partially faithful, with some information from outside the context
- 0.0: Response is not faithful, contradicting or ignoring the context

Provide your response in this exact JSON format:
{
  "score": <number between 0.0 and 1.0>,
  "explanation": "<brief explanation>",
  "confidence": <number between 0.0 and 1.0>
}`;
  }

  /**
   * Build relevance prompt
   */
  private buildRelevancePrompt(request: JudgeRequest): string {
    return `You are an evaluator assessing whether an AI assistant's response is relevant to the user's intent.

User Intent: ${request.intent || 'N/A'}

Assistant Response: ${request.response}

Rate the relevance of the response to the intent on a scale from 0.0 to 1.0, where:
- 1.0: Response directly addresses the intent
- 0.5: Response partially addresses the intent
- 0.0: Response is irrelevant to the intent

Provide your response in this exact JSON format:
{
  "score": <number between 0.0 and 1.0>,
  "explanation": "<brief explanation>",
  "confidence": <number between 0.0 and 1.0>
}`;
  }

  /**
   * Build tool correctness prompt
   */
  private buildToolCorrectnessPrompt(request: JudgeRequest): string {
    return `You are an evaluator assessing whether an AI assistant selected the correct tool and used it properly.

Expected Tool: ${request.expected_tool || 'N/A'}
Actual Tool: ${request.actual_tool || 'N/A'}
Arguments: ${JSON.stringify(request.arguments || {})}

Rate the tool correctness on a scale from 0.0 to 1.0, where:
- 1.0: Correct tool selected with proper arguments
- 0.5: Correct tool but incorrect arguments, or wrong tool with good reasoning
- 0.0: Wrong tool selected with incorrect arguments

Provide your response in this exact JSON format:
{
  "score": <number between 0.0 and 1.0>,
  "explanation": "<brief explanation>",
  "confidence": <number between 0.0 and 1.0>
}`;
  }

  /**
   * Build overall quality prompt
   */
  private buildOverallQualityPrompt(request: JudgeRequest): string {
    return `You are an evaluator assessing the overall quality of an AI assistant's response.

Context: ${request.context || 'N/A'}
User Intent: ${request.intent || 'N/A'}

Assistant Response: ${request.response}

Rate the overall quality on a scale from 0.0 to 1.0, considering:
- Accuracy and correctness
- Completeness
- Clarity and coherence
- Helpfulness

Provide your response in this exact JSON format:
{
  "score": <number between 0.0 and 1.0>,
  "explanation": "<brief explanation>",
  "confidence": <number between 0.0 and 1.0>
}`;
  }

  private async callLLM(prompt: string): Promise<string> {
    const provider = this.config.provider;

    try {
      switch (provider) {
        case 'gpt4': {
          const apiKey = this.config.apiKey || process.env.OPENAI_API_KEY;
          if (!apiKey) throw new Error('OPENAI_API_KEY not set');
          const { default: OpenAI } = await import('openai');
          const client = new OpenAI({ apiKey });
          const response = await client.chat.completions.create({
            model: this.config.model || 'gpt-4-turbo',
            messages: [{ role: 'user', content: prompt }],
            temperature: this.config.temperature ?? 0,
            response_format: { type: 'json_object' },
          });
          return response.choices[0]?.message?.content || '{}';
        }
        case 'claude': {
          const apiKey = this.config.apiKey || process.env.ANTHROPIC_API_KEY;
          if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
          const { default: Anthropic } = await import('@anthropic-ai/sdk');
          const client = new Anthropic({ apiKey });
          const response = await client.messages.create({
            model: this.config.model || 'claude-sonnet-4-20250514',
            max_tokens: this.config.maxTokens ?? 1024,
            messages: [{ role: 'user', content: prompt }],
          });
          const textBlock = response.content.find((b: { type: string }) => b.type === 'text');
          return (textBlock as { type: 'text'; text: string })?.text || '{}';
        }
        case 'gemini': {
          const apiKey = this.config.apiKey || process.env.GOOGLE_API_KEY;
          if (!apiKey) throw new Error('GOOGLE_API_KEY not set');
          const { GoogleGenerativeAI } = await import('@google/generative-ai');
          const genAI = new GoogleGenerativeAI(apiKey);
          const model = genAI.getGenerativeModel({
            model: this.config.model || 'gemini-pro',
          });
          const result = await model.generateContent(prompt);
          return result.response.text() || '{}';
        }
        case 'openrouter': {
          const apiKey = this.config.apiKey || process.env.OPENROUTER_API_KEY;
          if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');
          const { default: OpenAI } = await import('openai');
          const client = new OpenAI({
            apiKey,
            baseURL: 'https://openrouter.ai/api/v1',
          });
          const response = await client.chat.completions.create({
            model: this.config.model || 'openai/gpt-4-turbo',
            messages: [{ role: 'user', content: prompt }],
            temperature: this.config.temperature ?? 0,
            response_format: { type: 'json_object' },
          });
          return response.choices[0]?.message?.content || '{}';
        }
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'test' || process.env.JUDGE_MOCK === 'true') {
        return JSON.stringify({
          score: 0.85,
          explanation: 'Mock response (provider unavailable)',
          confidence: 0.9,
        });
      }
      throw error;
    }
  }

  /**
   * Parse LLM response
   */
  private parseResponse(response: string): JudgeScore {
    try {
      const parsed = JSON.parse(response);
      return {
        score: Math.max(0, Math.min(1, parsed.score)),
        explanation: parsed.explanation || '',
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        calibrated: false,
        ...(parsed.cost != null && { cost: parsed.cost }),
      };
    } catch {
      return this.getFallbackScore();
    }
  }

  /**
   * Get fallback score for errors
   */
  private getFallbackScore(): JudgeScore {
    return {
      score: 0.5,
      explanation: 'Fallback score due to evaluation error',
      confidence: 0.1,
      calibrated: false,
    };
  }
}
