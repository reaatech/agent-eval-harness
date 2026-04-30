import { describe, expect, it } from 'vitest';

describe('MCP Server', () => {
  it('should export createMCPServer', async () => {
    const { createMCPServer } = await import('./mcp-server.js');
    expect(createMCPServer).toBeDefined();
    expect(typeof createMCPServer).toBe('function');
  });

  it('should export EvalHarnessMCPServer', async () => {
    const { EvalHarnessMCPServer } = await import('./mcp-server.js');
    expect(EvalHarnessMCPServer).toBeDefined();
    expect(typeof EvalHarnessMCPServer).toBe('function');
  });
});
