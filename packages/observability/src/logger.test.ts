import { describe, expect, it } from 'vitest';
import { createChildLogger, getGlobalRunId, getLogger, setGlobalRunId } from './logger.js';

describe('logger', () => {
  it('getLogger returns a logger instance', () => {
    const logger = getLogger({ format: 'json', level: 'silent' });
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('logger can log without crashing', () => {
    const logger = getLogger({ format: 'json', level: 'silent' });
    expect(() => {
      logger.info('test message');
      logger.error('test error');
      logger.warn('test warning');
      logger.debug('test debug');
    }).not.toThrow();
  });

  it('createChildLogger returns a child logger', () => {
    const child = createChildLogger({ component: 'test' });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
  });

  it('setGlobalRunId and getGlobalRunId work', () => {
    const runId = 'test-run-123';
    setGlobalRunId(runId);
    expect(getGlobalRunId()).toBe(runId);

    // Clean up
    setGlobalRunId('');
    expect(getGlobalRunId()).toBe('');
  });

  it('logger includes run_id when set', () => {
    const logger = getLogger({ format: 'json', level: 'silent' });
    logger.setRunId('run-456');
    expect(() => {
      logger.info('message with run id');
    }).not.toThrow();
    expect(logger.getRunId()).toBe('run-456');
  });
});
