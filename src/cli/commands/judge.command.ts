import { JudgeEngine } from '../../judge/engine.js';
import type { JudgeConfig, JudgeScore as EngineJudgeScore } from '../../judge/engine.js';
import type { JudgeScore } from '../../types/domain.js';
import { cliOut, cliError } from '../output.js';

export interface JudgeOptions {
  trajectory?: string;
  context?: string;
  response?: string;
  intent?: string;
  model?: string;
  calibrated?: boolean;
  verbose?: boolean;
  expectedTool?: string;
  actualTool?: string;
}

function toDomainScore(engineScore: EngineJudgeScore): JudgeScore {
  return {
    score: engineScore.score,
    explanation: engineScore.explanation,
    confidence: engineScore.confidence,
    calibrated: engineScore.calibrated,
  };
}

export async function judgeCommand(aspect: string, options: JudgeOptions): Promise<void> {
  const { context, response, intent, model = 'claude-opus' } = options;

  const config: JudgeConfig = { model, provider: 'claude' };
  const engine = new JudgeEngine(config);

  let result: JudgeScore;

  try {
    switch (aspect) {
      case 'faithfulness':
        if (!context || !response) {
          cliError('Faithfulness evaluation requires --context and --response');
          process.exit(1);
        }
        result = toDomainScore(await engine.judge({ type: 'faithfulness', context, response }));
        break;

      case 'relevance':
        if (!intent || !response) {
          cliError('Relevance evaluation requires --intent and --response');
          process.exit(1);
        }
        result = toDomainScore(await engine.judge({ type: 'relevance', intent, response }));
        break;

      case 'tool_correctness':
        if (!options.expectedTool || !options.actualTool) {
          cliError('Tool correctness evaluation requires --expected-tool and --actual-tool');
          process.exit(1);
        }
        result = toDomainScore(
          await engine.judge({
            type: 'tool_correctness',
            response: response || '',
            expected_tool: options.expectedTool,
            actual_tool: options.actualTool,
          }),
        );
        break;

      case 'overall': {
        if (!context || !response) {
          cliError('Overall evaluation requires --context and --response');
          process.exit(1);
        }
        const faithfulness = await engine.judge({ type: 'faithfulness', context, response });
        const relevance = intent
          ? await engine.judge({ type: 'relevance', intent, response })
          : null;

        result = {
          score: (faithfulness.score + (relevance?.score || 0)) / (relevance ? 2 : 1),
          explanation: `Combined score: faithfulness=${faithfulness.score.toFixed(3)}, relevance=${relevance?.score.toFixed(3) || 'N/A'}`,
          confidence: Math.min(faithfulness.confidence, relevance?.confidence ?? 1),
          calibrated: false,
        };
        break;
      }

      default:
        cliError(`Unknown aspect: ${aspect}`);
        cliError('Valid aspects: faithfulness, relevance, tool_correctness, overall');
        process.exit(1);
    }

    cliOut('\n=== Judge Results ===');
    cliOut(`Aspect: ${aspect}`);
    cliOut(`Model: ${model}`);
    cliOut(`Score: ${result.score.toFixed(3)}`);
    cliOut(`Confidence: ${((result.confidence ?? 0) * 100).toFixed(1)}%`);
    cliOut(`Calibrated: ${result.calibrated ? 'Yes' : 'No'}`);
    cliOut(`Explanation: ${result.explanation}`);
  } catch (error) {
    cliError('Judge evaluation failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
