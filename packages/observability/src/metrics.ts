import type { Counter, Histogram } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { MeterProvider } from '@opentelemetry/sdk-metrics';

/**
 * Metrics configuration
 */
export interface MetricsConfig {
  /** Service name */
  serviceName: string;
  /** Enable metrics */
  enabled: boolean;
  /** Exporter type */
  exporter: 'otlp' | 'prometheus' | 'console' | 'none';
  /** OTLP endpoint */
  otlpEndpoint?: string;
  /** Prometheus port */
  prometheusPort?: number;
  /** Export interval (ms) */
  exportInterval: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: MetricsConfig = {
  serviceName: 'agent-eval-harness',
  enabled: true,
  exporter: 'console',
  exportInterval: 60000,
};

/**
 * Metrics manager
 */
class MetricsManager {
  private provider: MeterProvider | null = null;
  private config: MetricsConfig;
  private initialized = false;

  // Counters
  private runsTotalCounter: Counter | null = null;
  private trajectoriesCounter: Counter | null = null;
  private judgeCallsCounter: Counter | null = null;

  // Histograms
  private judgeCostHistogram: Histogram | null = null;
  private costPerTaskHistogram: Histogram | null = null;

  // Gauges (modeled as histograms since synchronous Gauge is not in OTel API)
  private gatesResultGauge: Histogram | null = null;
  private latencyP99Gauge: Histogram | null = null;

  constructor(config: Partial<MetricsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize metrics
   */
  init(): void {
    if (!this.config.enabled || this.initialized) {
      return;
    }

    this.provider = new MeterProvider({
      resource: resourceFromAttributes({
        'service.name': this.config.serviceName,
      }),
    });

    // Add exporter
    switch (this.config.exporter) {
      case 'otlp':
        // OTLP exporter requires @opentelemetry/exporter-metrics-otlp-http
        // Not installed — falling back to console
        break;
      case 'prometheus':
        // Prometheus exporter requires @opentelemetry/exporter-prometheus
        // Not installed — falling back to console
        break;
      case 'console':
        break;
    }

    this.registerInstruments();
    this.initialized = true;
  }

  /**
   * Register metric instruments
   */
  private registerInstruments(): void {
    if (!this.provider) return;
    const m = this.provider.getMeter('agent-eval-harness');

    // Counters
    this.runsTotalCounter = m.createCounter('agent_eval.runs.total', {
      description: 'Total evaluation runs',
      unit: 'runs',
    });

    this.trajectoriesCounter = m.createCounter('agent_eval.trajectories.evaluated', {
      description: 'Trajectories processed',
      unit: 'trajectories',
    });

    this.judgeCallsCounter = m.createCounter('agent_eval.judge.calls', {
      description: 'LLM judge API calls',
      unit: 'calls',
    });

    // Histograms
    this.judgeCostHistogram = m.createHistogram('agent_eval.judge.cost', {
      description: 'Judge cost per run',
      unit: 'USD',
    });

    this.costPerTaskHistogram = m.createHistogram('agent_eval.cost.per_task', {
      description: 'Cost per task',
      unit: 'USD',
    });

    // Gauges (modeled as histograms)
    this.gatesResultGauge = m.createHistogram('agent_eval.gates.result', {
      description: 'Gate pass/fail (1/0)',
      unit: 'boolean',
    });

    this.latencyP99Gauge = m.createHistogram('agent_eval.latency.p99', {
      description: 'P99 latency',
      unit: 'ms',
    });
  }

  /**
   * Record evaluation run
   */
  recordRun(status: 'success' | 'failure' | 'partial', count = 1): void {
    this.runsTotalCounter?.add(count, { status });
  }

  /**
   * Record trajectories evaluated
   */
  recordTrajectories(dataset: string, count = 1): void {
    this.trajectoriesCounter?.add(count, { dataset });
  }

  /**
   * Record judge API call
   */
  recordJudgeCall(model: string, status: 'success' | 'failure'): void {
    this.judgeCallsCounter?.add(1, { model, status });
  }

  /**
   * Record judge cost
   */
  recordJudgeCost(model: string, cost: number): void {
    this.judgeCostHistogram?.record(cost, { model });
  }

  /**
   * Record cost per task
   */
  recordCostPerTask(taskType: string, cost: number): void {
    this.costPerTaskHistogram?.record(cost, { task_type: taskType });
  }

  /**
   * Record gate result
   */
  recordGateResult(gateName: string, passed: boolean): void {
    this.gatesResultGauge?.record(passed ? 1 : 0, { gate_name: gateName });
  }

  /**
   * Record latency P99
   */
  recordLatencyP99(component: string, latencyMs: number): void {
    this.latencyP99Gauge?.record(latencyMs, { component });
  }

  /**
   * Record batch metrics
   */
  recordBatchMetrics(metrics: {
    runs?: { status: 'success' | 'failure' | 'partial'; count?: number };
    trajectories?: { dataset: string; count?: number };
    judgeCalls?: { model: string; status: 'success' | 'failure' };
    judgeCost?: { model: string; cost: number };
    costPerTask?: { taskType: string; cost: number };
    gateResult?: { gateName: string; passed: boolean };
    latencyP99?: { component: string; latencyMs: number };
  }): void {
    if (metrics.runs) {
      this.recordRun(metrics.runs.status, metrics.runs.count);
    }
    if (metrics.trajectories) {
      this.recordTrajectories(metrics.trajectories.dataset, metrics.trajectories.count);
    }
    if (metrics.judgeCalls) {
      this.recordJudgeCall(metrics.judgeCalls.model, metrics.judgeCalls.status);
    }
    if (metrics.judgeCost) {
      this.recordJudgeCost(metrics.judgeCost.model, metrics.judgeCost.cost);
    }
    if (metrics.costPerTask) {
      this.recordCostPerTask(metrics.costPerTask.taskType, metrics.costPerTask.cost);
    }
    if (metrics.gateResult) {
      this.recordGateResult(metrics.gateResult.gateName, metrics.gateResult.passed);
    }
    if (metrics.latencyP99) {
      this.recordLatencyP99(metrics.latencyP99.component, metrics.latencyP99.latencyMs);
    }
  }

  /**
   * Shutdown metrics
   */
  async shutdown(): Promise<void> {
    if (this.provider) {
      await this.provider.shutdown();
      this.initialized = false;
    }
  }

  /**
   * Force flush metrics
   */
  async forceFlush(): Promise<void> {
    if (this.provider) {
      await this.provider.forceFlush();
    }
  }
}

/**
 * Singleton instance
 */
let metricsInstance: MetricsManager | null = null;

/**
 * Get metrics manager instance
 */
export function getMetricsManager(config?: Partial<MetricsConfig>): MetricsManager {
  if (!metricsInstance) {
    metricsInstance = new MetricsManager(config);
    metricsInstance.init();
  }
  return metricsInstance;
}

/**
 * Record metric helper
 */
export function recordMetric(
  name: string,
  value: number,
  attributes?: Record<string, string | number | boolean>,
): void {
  const provider = (metricsInstance as unknown as { provider: MeterProvider | null })?.provider;
  if (!provider) return;
  const m = provider.getMeter('agent-eval-harness');
  const instrument = m.createHistogram(name);
  instrument.record(value, attributes);
}

/**
 * Increment counter helper
 */
export function incrementCounter(
  name: string,
  value = 1,
  attributes?: Record<string, string | number | boolean>,
): void {
  const provider = (metricsInstance as unknown as { provider: MeterProvider | null })?.provider;
  if (!provider) return;
  const m = provider.getMeter('agent-eval-harness');
  const instrument = m.createCounter(name);
  instrument.add(value, attributes);
}
