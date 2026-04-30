import pino from 'pino';
import type { LoggerOptions } from 'pino';

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Log level */
  level: string;
  /** Log format */
  format: 'json' | 'pretty';
  /** Include run ID on every line */
  includeRunId: boolean;
  /** PII redaction patterns */
  piiPatterns: RegExp[];
  /** Redact fields */
  redactFields: string[];
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: LoggerConfig = {
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.NODE_ENV === 'production' ? 'json' : 'pretty',
  includeRunId: true,
  piiPatterns: [
    /email[s]?[:\s]+[^\s,]+/gi,
    /phone[s]?[:\s]+[^\s,]+/gi,
    /ssn[:\s]+[^\s,]+/gi,
    /password[s]?[:\s]+[^\s,]+/gi,
    /api[_-]?key[s]?[:\s]+[^\s,]+/gi,
    /token[s]?[:\s]+[^\s,]+/gi,
    /secret[s]?[:\s]+[^\s,]+/gi,
  ],
  redactFields: ['password', 'secret', 'token', 'apiKey', 'api_key', 'authorization'],
};

/**
 * PII redactor
 */
class PIIRedactor {
  private patterns: RegExp[];
  private fieldRedactor: pino.redactOptions;

  constructor(config: LoggerConfig) {
    this.patterns = config.piiPatterns;
    this.fieldRedactor = {
      paths: config.redactFields.map((field) => `**.${field}`),
      censor: '[REDACTED]',
    };
  }

  /**
   * Redact PII from string
   */
  redactString(str: string): string {
    let result = str;
    for (const pattern of this.patterns) {
      result = result.replace(pattern, (match) => {
        const parts = match.split(/(:\s*|\s+)/);
        return `${parts[0]}[REDACTED]`;
      });
    }
    return result;
  }

  /**
   * Get pino redact options
   */
  getRedactOptions(): pino.redactOptions {
    return this.fieldRedactor;
  }
}

/**
 * Logger wrapper
 */
class Logger {
  private logger: pino.Logger;
  private config: LoggerConfig;
  private redactor: PIIRedactor;
  private runId: string | null = null;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.redactor = new PIIRedactor(this.config);

    const pinoOptions: LoggerOptions = {
      level: this.config.level,
      redact: this.redactor.getRedactOptions(),
      formatters: {
        level: (label) => ({ level: label }),
        bindings: (bindings) => ({
          ...bindings,
          service: 'agent-eval-harness',
        }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    };

    if (this.config.format === 'pretty') {
      pinoOptions.transport = {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      };
    }

    this.logger = pino(pinoOptions);
  }

  /**
   * Set run ID for correlation
   */
  setRunId(runId: string | null): void {
    this.runId = runId;
  }

  /**
   * Get run ID
   */
  getRunId(): string | null {
    return this.runId;
  }

  /**
   * Create child logger with additional context
   */
  child(bindings: pino.Bindings): Logger {
    const childLogger = new Logger(this.config);
    childLogger.logger = this.logger.child(bindings);
    childLogger.runId = this.runId;
    return childLogger;
  }

  /**
   * Log debug message
   */
  debug(msg: string, ...args: unknown[]): void {
    this.log('debug', msg, ...args);
  }

  /**
   * Log info message
   */
  info(msg: string, ...args: unknown[]): void {
    this.log('info', msg, ...args);
  }

  /**
   * Log warning message
   */
  warn(msg: string, ...args: unknown[]): void {
    this.log('warn', msg, ...args);
  }

  /**
   * Log error message
   */
  error(msg: string, ...args: unknown[]): void {
    this.log('error', msg, ...args);
  }

  /**
   * Log fatal message
   */
  fatal(msg: string, ...args: unknown[]): void {
    this.log('fatal', msg, ...args);
  }

  /**
   * Log trace message
   */
  trace(msg: string, ...args: unknown[]): void {
    this.log('trace', msg, ...args);
  }

  /**
   * Internal log method
   */
  private log(level: string, msg: string, ...args: unknown[]): void {
    const logArgs = args.filter((arg) => arg !== undefined && arg !== null);

    // Redact PII from message
    const redactedMsg = this.redactor.redactString(msg);

    // Build log object with run ID
    const logObj: Record<string, unknown> = {
      msg: redactedMsg,
    };

    if (this.runId && this.config.includeRunId) {
      logObj.run_id = this.runId;
    }

    // Add any object arguments
    for (const arg of logArgs) {
      if (typeof arg === 'object' && arg !== null) {
        Object.assign(logObj, arg);
      }
    }

    const logFn = (
      this.logger as unknown as Record<string, ((obj: object, msg?: string) => void) | undefined>
    )[level];
    logFn?.(logObj);
  }

  /**
   * Log evaluation run start
   */
  logEvalRunStart(runId: string, trajectoryCount: number, config: unknown): void {
    this.setRunId(runId);
    this.info('Evaluation run started', {
      run_id: runId,
      trajectories: trajectoryCount,
      config,
    });
  }

  /**
   * Log evaluation run end
   */
  logEvalRunEnd(runId: string, metrics: unknown, duration: number): void {
    this.info('Evaluation run completed', {
      run_id: runId,
      duration_ms: duration,
      metrics,
    });
  }

  /**
   * Log gate evaluation
   */
  logGateEvaluation(gateName: string, passed: boolean, reason: string): void {
    this.info(`Gate ${passed ? 'passed' : 'failed'}: ${gateName}`, {
      gate: gateName,
      passed,
      reason,
    });
  }

  /**
   * Log cost tracking
   */
  logCost(runId: string, cost: number, breakdown: unknown): void {
    this.info('Cost tracked', {
      run_id: runId,
      cost,
      breakdown,
    });
  }

  /**
   * Log error with context
   */
  logError(error: Error, context?: Record<string, unknown>): void {
    this.error(error.message, {
      error: error.stack,
      ...context,
    });
  }
}

/**
 * Singleton instance
 */
let loggerInstance: Logger | null = null;

/**
 * Get logger instance
 */
export function getLogger(config?: Partial<LoggerConfig>): Logger {
  if (!loggerInstance) {
    loggerInstance = new Logger(config);
  }
  return loggerInstance;
}

/**
 * Create child logger
 */
export function createChildLogger(bindings: pino.Bindings): Logger {
  const logger = getLogger();
  return logger.child(bindings);
}

/**
 * Set global run ID
 */
export function setGlobalRunId(runId: string): void {
  getLogger().setRunId(runId);
}

/**
 * Get global run ID
 */
export function getGlobalRunId(): string | null {
  return getLogger().getRunId();
}
