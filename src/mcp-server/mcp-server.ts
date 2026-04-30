import { createRequire } from 'node:module';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

// Gate tools
import { executeGateTool, registerGateTools } from './tools/gate/index.js';
// Judge tools
import { executeJudgeTool, registerJudgeTools } from './tools/judge/index.js';
// Suite tools
import { executeSuiteTool, registerSuiteTools } from './tools/suite/index.js';

const require = createRequire(import.meta.url);
const PACKAGE_VERSION: string = (require('../../package.json') as { version: string }).version;

/**
 * MCP Server Configuration
 */
export interface MCPServerConfig {
  /** Server name */
  name: string;
  /** Server version */
  version: string;
  /** Enable judge tools */
  enableJudgeTools: boolean;
  /** Enable suite tools */
  enableSuiteTools: boolean;
  /** Enable gate tools */
  enableGateTools: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: MCPServerConfig = {
  name: 'agent-eval-harness',
  version: PACKAGE_VERSION,
  enableJudgeTools: true,
  enableSuiteTools: true,
  enableGateTools: true,
};

/**
 * Agent Eval Harness MCP Server
 */
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

  /**
   * Set up tool handlers
   */
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

  /**
   * Set up request handlers
   */
  private setupRequestHandlers(): void {
    // Handle list_tools request
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

    // Handle call_tool request
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

  /**
   * Start the server with stdio transport
   */
  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    // eslint-disable-next-line no-console
    console.error('Agent Eval Harness MCP Server running on stdio');
  }

  /**
   * Get the underlying server instance
   */
  getServer(): Server {
    return this.server;
  }

  /**
   * Close the server
   */
  async close(): Promise<void> {
    await this.server.close();
  }
}

/**
 * Create and run MCP server
 */
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

/**
 * Start server from CLI
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  createMCPServer().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  });
}
