import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { executeGateTool, registerGateTools } from './tools/gate/index.js';
import { executeJudgeTool, registerJudgeTools } from './tools/judge/index.js';
import { executeSuiteTool, registerSuiteTools } from './tools/suite/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_VERSION: string = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'),
).version as string;

export interface MCPServerConfig {
  name: string;
  version: string;
  enableJudgeTools: boolean;
  enableSuiteTools: boolean;
  enableGateTools: boolean;
}

const DEFAULT_CONFIG: MCPServerConfig = {
  name: 'agent-eval-harness',
  version: PACKAGE_VERSION,
  enableJudgeTools: true,
  enableSuiteTools: true,
  enableGateTools: true,
};

export class EvalHarnessMCPServer {
  private server: Server;
  private config: MCPServerConfig;
  private toolHandlers: Map<string, (args: unknown) => Promise<unknown>> = new Map();

  constructor(config: Partial<MCPServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.server = new Server(
      {
        name: this.config.name,
        version: this.config.version,
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupToolHandlers();
    this.setupRequestHandlers();
  }

  private setupToolHandlers(): void {
    if (this.config.enableJudgeTools) {
      const judgeTools = registerJudgeTools();
      for (const tool of judgeTools) {
        this.toolHandlers.set(tool.name, (args) => executeJudgeTool(tool.name, args));
      }
    }

    if (this.config.enableSuiteTools) {
      const suiteTools = registerSuiteTools();
      for (const tool of suiteTools) {
        this.toolHandlers.set(tool.name, (args) => executeSuiteTool(tool.name, args));
      }
    }

    if (this.config.enableGateTools) {
      const gateTools = registerGateTools();
      for (const tool of gateTools) {
        this.toolHandlers.set(tool.name, (args) => executeGateTool(tool.name, args));
      }
    }
  }

  private setupRequestHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = [];

      if (this.config.enableJudgeTools) {
        tools.push(...registerJudgeTools());
      }
      if (this.config.enableSuiteTools) {
        tools.push(...registerSuiteTools());
      }
      if (this.config.enableGateTools) {
        tools.push(...registerGateTools());
      }

      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const handler = this.toolHandlers.get(name);
      if (!handler) {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }

      try {
        const result = await handler(args);
        return {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${(error as Error).message}`,
        );
      }
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    // eslint-disable-next-line no-console
    console.error('Agent Eval Harness MCP Server running on stdio');
  }

  getServer(): Server {
    return this.server;
  }

  async close(): Promise<void> {
    await this.server.close();
  }
}

export async function createMCPServer(
  config?: Partial<MCPServerConfig>,
): Promise<EvalHarnessMCPServer> {
  const server = new EvalHarnessMCPServer(config);
  process.on('SIGTERM', async () => {
    await server.close();
    process.exit(0);
  });
  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });
  await server.run();
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createMCPServer().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  });
}
