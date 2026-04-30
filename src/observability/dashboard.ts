import type { AggregatedResults } from '../suite/results.js';

/**
 * Dashboard data point
 */
export interface DataPoint {
  timestamp: string;
  value: number;
  label?: string;
}

/**
 * Dashboard metric series
 */
export interface MetricSeries {
  name: string;
  description: string;
  unit: string;
  data: DataPoint[];
  trend?: 'up' | 'down' | 'stable';
  alertThreshold?: number;
  alertDirection?: 'above' | 'below';
}

/**
 * Dashboard panel
 */
export interface DashboardPanel {
  title: string;
  type: 'chart' | 'stat' | 'table' | 'alert';
  metrics: MetricSeries[];
  timeRange?: {
    start: string;
    end: string;
  };
}

/**
 * Dashboard configuration
 */
export interface DashboardConfig {
  /** Time range for trends (hours) */
  trendHours: number;
  /** Alert thresholds */
  alertThresholds: {
    qualityScore: number;
    costPerTask: number;
    latencyP99: number;
    passRate: number;
  };
  /** Trend calculation window */
  trendWindow: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: DashboardConfig = {
  trendHours: 24,
  alertThresholds: {
    qualityScore: 0.8,
    costPerTask: 0.05,
    latencyP99: 5000,
    passRate: 0.95,
  },
  trendWindow: 3, // Use last 3 data points for trend
};

/**
 * Dashboard metrics manager
 */
export class DashboardManager {
  private config: DashboardConfig;
  private dataStore: Map<string, DataPoint[]> = new Map();
  private alerts: AlertMessage[] = [];

  constructor(config: Partial<DashboardConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Record evaluation run metrics
   */
  recordRun(results: AggregatedResults): void {
    const timestamp = new Date().toISOString();

    // Record overall score
    this.addDataPoint('overall_score', {
      timestamp,
      value: results.overallMetrics.overallScore,
    });

    // Record pass rate
    this.addDataPoint('pass_rate', {
      timestamp,
      value: results.summary.passRate / 100,
    });

    // Record cost per task
    this.addDataPoint('cost_per_task', {
      timestamp,
      value: results.overallMetrics.avgCostPerTask,
    });

    // Record latency P99
    this.addDataPoint('latency_p99', {
      timestamp,
      value: results.overallMetrics.latencyP99,
    });

    // Record per-metric scores
    for (const [metric, breakdown] of Object.entries(results.metricBreakdown)) {
      this.addDataPoint(`metric_${metric}`, {
        timestamp,
        value: breakdown.avgScore,
      });
    }

    // Check for alerts
    this.checkAlerts(results, timestamp);
  }

  /**
   * Add data point to series
   */
  private addDataPoint(metric: string, point: DataPoint): void {
    let data = this.dataStore.get(metric);
    if (!data) {
      data = [];
      this.dataStore.set(metric, data);
    }
    data.push(point);

    // Keep only recent data
    const cutoff = new Date(Date.now() - this.config.trendHours * 60 * 60 * 1000);
    while (data.length > 0 && data[0] && new Date(data[0].timestamp) < cutoff) {
      data.shift();
    }
  }

  /**
   * Check for alert conditions
   */
  private checkAlerts(results: AggregatedResults, timestamp: string): void {
    const thresholds = this.config.alertThresholds;

    // Quality score alert
    if (results.overallMetrics.overallScore < thresholds.qualityScore) {
      this.addAlert({
        level: 'warning',
        metric: 'overall_score',
        message: `Quality score ${results.overallMetrics.overallScore.toFixed(3)} below threshold ${thresholds.qualityScore}`,
        timestamp,
        value: results.overallMetrics.overallScore,
        threshold: thresholds.qualityScore,
      });
    }

    // Cost alert
    if (results.overallMetrics.avgCostPerTask > thresholds.costPerTask) {
      this.addAlert({
        level: 'warning',
        metric: 'cost_per_task',
        message: `Cost per task $${results.overallMetrics.avgCostPerTask.toFixed(4)} above threshold $${thresholds.costPerTask}`,
        timestamp,
        value: results.overallMetrics.avgCostPerTask,
        threshold: thresholds.costPerTask,
      });
    }

    // Latency alert
    if (results.overallMetrics.latencyP99 > thresholds.latencyP99) {
      this.addAlert({
        level: 'warning',
        metric: 'latency_p99',
        message: `P99 latency ${results.overallMetrics.latencyP99.toFixed(0)}ms above threshold ${thresholds.latencyP99}ms`,
        timestamp,
        value: results.overallMetrics.latencyP99,
        threshold: thresholds.latencyP99,
      });
    }

    // Pass rate alert
    if (results.summary.passRate / 100 < thresholds.passRate) {
      this.addAlert({
        level: 'warning',
        metric: 'pass_rate',
        message: `Pass rate ${results.summary.passRate.toFixed(1)}% below threshold ${(thresholds.passRate * 100).toFixed(0)}%`,
        timestamp,
        value: results.summary.passRate / 100,
        threshold: thresholds.passRate,
      });
    }
  }

  /**
   * Add alert message
   */
  private addAlert(alert: AlertMessage): void {
    this.alerts.push(alert);

    // Keep only recent alerts
    const cutoff = new Date(Date.now() - this.config.trendHours * 60 * 60 * 1000);
    while (
      this.alerts.length > 0 &&
      this.alerts[0] &&
      new Date(this.alerts[0].timestamp) < cutoff
    ) {
      this.alerts.shift();
    }
  }

  /**
   * Get metric series with trend
   */
  getMetricSeries(metric: string, name: string, description: string, unit: string): MetricSeries {
    const data = this.dataStore.get(metric) || [];
    const trend = this.calculateTrend(data);

    return {
      name,
      description,
      unit,
      data,
      trend,
    };
  }

  /**
   * Calculate trend direction
   */
  private calculateTrend(data: DataPoint[]): 'up' | 'down' | 'stable' {
    if (data.length < this.config.trendWindow) {
      return 'stable';
    }

    const recent = data.slice(-this.config.trendWindow);
    const values = recent.map((d) => d.value);

    // Calculate slope using linear regression
    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((acc, val, idx) => acc + idx * val, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    // Threshold for trend detection
    const threshold = 0.01;
    if (slope > threshold) return 'up';
    if (slope < -threshold) return 'down';
    return 'stable';
  }

  /**
   * Generate dashboard panels
   */
  generateDashboard(): DashboardPanel[] {
    return [
      {
        title: 'Quality Metrics',
        type: 'chart',
        metrics: [
          this.getMetricSeries(
            'overall_score',
            'Overall Score',
            'Average evaluation score',
            'score',
          ),
          this.getMetricSeries(
            'pass_rate',
            'Pass Rate',
            'Percentage of passing trajectories',
            'ratio',
          ),
        ],
      },
      {
        title: 'Performance Metrics',
        type: 'chart',
        metrics: [
          this.getMetricSeries('latency_p99', 'P99 Latency', '99th percentile latency', 'ms'),
          this.getMetricSeries(
            'cost_per_task',
            'Cost per Task',
            'Average cost per evaluation',
            'USD',
          ),
        ],
      },
      {
        title: 'Key Statistics',
        type: 'stat',
        metrics: this.generateStatMetrics(),
      },
      {
        title: 'Alerts',
        type: 'alert',
        metrics: this.getAlertMetrics(),
      },
    ];
  }

  /**
   * Generate stat metrics
   */
  private generateStatMetrics(): MetricSeries[] {
    const metrics: MetricSeries[] = [];

    // Current values
    const latestScore = this.getLatestValue('overall_score');
    if (latestScore !== null) {
      metrics.push({
        name: 'Current Score',
        description: 'Latest overall quality score',
        unit: 'score',
        data: [{ timestamp: new Date().toISOString(), value: latestScore }],
        trend: this.calculateTrend(this.dataStore.get('overall_score') || []),
        alertThreshold: this.config.alertThresholds.qualityScore,
        alertDirection: 'below',
      });
    }

    const latestPassRate = this.getLatestValue('pass_rate');
    if (latestPassRate !== null) {
      metrics.push({
        name: 'Pass Rate',
        description: 'Current pass rate',
        unit: 'ratio',
        data: [{ timestamp: new Date().toISOString(), value: latestPassRate }],
        trend: this.calculateTrend(this.dataStore.get('pass_rate') || []),
        alertThreshold: this.config.alertThresholds.passRate,
        alertDirection: 'below',
      });
    }

    return metrics;
  }

  /**
   * Get alert metrics
   */
  private getAlertMetrics(): MetricSeries[] {
    return this.alerts.map((alert) => ({
      name: alert.metric,
      description: alert.message,
      unit: '',
      data: [{ timestamp: alert.timestamp, value: alert.value }],
    }));
  }

  /**
   * Get latest value for metric
   */
  private getLatestValue(metric: string): number | null {
    const data = this.dataStore.get(metric);
    if (!data || data.length === 0) return null;
    const last = data[data.length - 1];
    return last ? last.value : null;
  }

  /**
   * Get alerts
   */
  getAlerts(): AlertMessage[] {
    return this.alerts;
  }

  /**
   * Get trend data for visualization
   */
  getTrendData(metric: string, points = 50): DataPoint[] {
    const data = this.dataStore.get(metric) || [];
    return data.slice(-points);
  }

  /**
   * Generate summary statistics
   */
  getSummary(): DashboardSummary {
    const score = this.getLatestValue('overall_score');
    const passRate = this.getLatestValue('pass_rate');
    const cost = this.getLatestValue('cost_per_task');
    const latency = this.getLatestValue('latency_p99');

    return {
      totalRuns: this.dataStore.get('overall_score')?.length || 0,
      currentScore: score,
      currentPassRate: passRate ? passRate * 100 : null,
      currentCostPerTask: cost,
      currentLatencyP99: latency,
      activeAlerts: this.alerts.length,
      trends: {
        score:
          score !== null
            ? this.calculateTrend(this.dataStore.get('overall_score') || [])
            : 'stable',
        passRate:
          passRate !== null ? this.calculateTrend(this.dataStore.get('pass_rate') || []) : 'stable',
      },
    };
  }
}

/**
 * Alert message
 */
export interface AlertMessage {
  level: 'info' | 'warning' | 'critical';
  metric: string;
  message: string;
  timestamp: string;
  value: number;
  threshold: number;
}

/**
 * Dashboard summary
 */
export interface DashboardSummary {
  totalRuns: number;
  currentScore: number | null;
  currentPassRate: number | null;
  currentCostPerTask: number | null;
  currentLatencyP99: number | null;
  activeAlerts: number;
  trends: {
    score: 'up' | 'down' | 'stable';
    passRate: 'up' | 'down' | 'stable';
  };
}

/**
 * Singleton instance
 */
let dashboardInstance: DashboardManager | null = null;

/**
 * Get dashboard manager instance
 */
export function getDashboardManager(config?: Partial<DashboardConfig>): DashboardManager {
  if (!dashboardInstance) {
    dashboardInstance = new DashboardManager(config);
  }
  return dashboardInstance;
}
