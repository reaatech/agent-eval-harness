import { describe, expect, it } from 'vitest';

describe('CLI', () => {
  it('should export the library', async () => {
    const lib = await import('./index.js');
    expect(lib).toBeDefined();
  });
});
