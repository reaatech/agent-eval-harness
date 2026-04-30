import type { JudgeScore } from './engine.js';

/**
 * Human label for calibration
 */
export interface HumanLabel {
  /** Sample ID */
  sampleId: string;
  /** Human-provided score (0.0 to 1.0) */
  score: number;
  /** Type of judgment */
  type: string;
  /** Optional explanation */
  explanation?: string;
}

/**
 * Calibration data point
 */
export interface CalibrationPoint {
  sampleId: string;
  rawScore: number;
  humanScore: number;
}

/**
 * Calibration method types
 */
export type CalibrationMethod = 'temperature_scaling' | 'isotonic_regression' | 'linear';

/**
 * Calibration result
 */
export interface CalibrationResult {
  /** Method used */
  method: CalibrationMethod;
  /** Number of samples used */
  sampleCount: number;
  /** Before calibration MAE */
  beforeMAE: number;
  /** After calibration MAE */
  afterMAE: number;
  /** Improvement percentage */
  improvement: number;
  /** Calibration parameters */
  parameters: Record<string, number>;
}

/**
 * Consensus configuration
 */
export interface ConsensusConfig {
  /** Whether consensus is enabled */
  enabled: boolean;
  /** Models to use for consensus */
  models: Array<{
    id: string;
    weight: number;
  }>;
  /** Voting strategy */
  votingStrategy: 'weighted' | 'majority' | 'unweighted';
  /** Minimum agreement threshold */
  minAgreement: number;
  /** Tie breaker strategy */
  tieBreaker: 'highest_confidence' | 'average';
}

/**
 * Consensus result
 */
export interface ConsensusResult {
  /** Final consensus score */
  score: number;
  /** Individual scores */
  individualScores: Array<{ model: string; score: number }>;
  /** Agreement level (0.0 to 1.0) */
  agreement: number;
  /** Whether consensus was reached */
  consensusReached: boolean;
}

/**
 * Judge Calibrator
 */
export class JudgeCalibrator {
  private calibrationPoints: CalibrationPoint[] = [];
  private method: CalibrationMethod;
  private parameters: Record<string, number> = {};
  private isCalibrated = false;

  constructor(method: CalibrationMethod = 'temperature_scaling') {
    this.method = method;
  }

  /**
   * Add calibration data
   */
  addCalibrationData(humanLabels: HumanLabel[], judgeScores: JudgeScore[]): void {
    for (let i = 0; i < humanLabels.length; i++) {
      const label = humanLabels[i];
      const judgeScore = judgeScores[i];
      if (!label || !judgeScore || judgeScore.rawScore === undefined) continue;
      this.calibrationPoints.push({
        sampleId: label.sampleId,
        rawScore: judgeScore.rawScore,
        humanScore: label.score,
      });
    }
  }

  /**
   * Run calibration
   */
  calibrate(): CalibrationResult {
    if (this.calibrationPoints.length < 3) {
      throw new Error('Need at least 3 calibration points');
    }

    const beforeMAE = this.calculateMAE(
      this.calibrationPoints.map((p) => p.rawScore),
      this.calibrationPoints.map((p) => p.humanScore),
    );

    switch (this.method) {
      case 'temperature_scaling':
        this.parameters = this.temperatureScaling();
        break;
      case 'isotonic_regression':
        this.parameters = this.isotonicRegression();
        break;
      case 'linear':
        this.parameters = this.linearCalibration();
        break;
    }

    const calibratedScores = this.calibrationPoints.map((p) => this.apply(p.rawScore));
    const afterMAE = this.calculateMAE(
      calibratedScores,
      this.calibrationPoints.map((p) => p.humanScore),
    );

    this.isCalibrated = true;

    return {
      method: this.method,
      sampleCount: this.calibrationPoints.length,
      beforeMAE: Math.round(beforeMAE * 1000) / 1000,
      afterMAE: Math.round(afterMAE * 1000) / 1000,
      improvement: Math.round(((beforeMAE - afterMAE) / beforeMAE) * 10000) / 100,
      parameters: this.parameters,
    };
  }

  /**
   * Apply calibration to a score
   */
  apply(rawScore: number): number {
    if (!this.isCalibrated) {
      return rawScore;
    }

    switch (this.method) {
      case 'temperature_scaling': {
        const T = this.parameters.temperature || 1;
        return Math.min(1, Math.max(0, this.sigmoid(this.logit(rawScore) / T)));
      }
      case 'isotonic_regression': {
        const scale = this.parameters.scale || 1;
        const offset = this.parameters.offset || 0;
        return Math.min(1, Math.max(0, rawScore * scale + offset));
      }
      case 'linear': {
        const slope = this.parameters.slope || 1;
        const intercept = this.parameters.intercept || 0;
        return Math.min(1, Math.max(0, rawScore * slope + intercept));
      }
      default:
        return rawScore;
    }
  }

  /**
   * Temperature scaling calibration
   */
  private temperatureScaling(): Record<string, number> {
    // Simple grid search for optimal temperature
    let bestT = 1;
    let bestMAE = Number.POSITIVE_INFINITY;

    for (let T = 0.1; T <= 5; T += 0.1) {
      const scores = this.calibrationPoints.map((p) =>
        Math.min(1, Math.max(0, this.sigmoid(this.logit(p.rawScore) / T))),
      );
      const humanScores = this.calibrationPoints.map((p) => p.humanScore);
      const mae = this.calculateMAE(scores, humanScores);

      if (mae < bestMAE) {
        bestMAE = mae;
        bestT = T;
      }
    }

    return { temperature: Math.round(bestT * 100) / 100 };
  }

  /**
   * Isotonic regression calibration
   */
  private isotonicRegression(): Record<string, number> {
    // Simple linear fit as approximation
    const n = this.calibrationPoints.length;
    const sumX = this.calibrationPoints.reduce((s, p) => s + p.rawScore, 0);
    const sumY = this.calibrationPoints.reduce((s, p) => s + p.humanScore, 0);
    const sumXY = this.calibrationPoints.reduce((s, p) => s + p.rawScore * p.humanScore, 0);
    const sumX2 = this.calibrationPoints.reduce((s, p) => s + p.rawScore * p.rawScore, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const offset = (sumY - slope * sumX) / n;

    return {
      scale: Math.round(slope * 1000) / 1000,
      offset: Math.round(offset * 1000) / 1000,
    };
  }

  /**
   * Linear calibration
   */
  private linearCalibration(): Record<string, number> {
    const result = this.isotonicRegression();
    return {
      slope: result.scale ?? 0,
      intercept: result.offset ?? 0,
    };
  }

  /**
   * Calculate Mean Absolute Error
   */
  private calculateMAE(predicted: number[], actual: number[]): number {
    const n = Math.min(predicted.length, actual.length);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const pred = predicted[i] ?? 0;
      const act = actual[i] ?? 0;
      sum += Math.abs(pred - act);
    }
    return sum / n;
  }

  /**
   * Sigmoid function
   */
  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  /**
   * Logit function
   */
  private logit(p: number): number {
    const clamped = Math.max(0.001, Math.min(0.999, p));
    return Math.log(clamped / (1 - clamped));
  }

  /**
   * Check if calibrated
   */
  getIsCalibrated(): boolean {
    return this.isCalibrated;
  }
}

/**
 * Multi-judge consensus engine
 */
export class ConsensusEngine {
  private config: ConsensusConfig;

  constructor(config: ConsensusConfig) {
    this.config = config;
  }

  /**
   * Get consensus from multiple judge scores
   */
  consensus(scores: Array<{ model: string; score: JudgeScore }>): ConsensusResult {
    if (!this.config.enabled) {
      return {
        score: scores[0]?.score.score || 0,
        individualScores: scores.map((s) => ({ model: s.model, score: s.score.score })),
        agreement: 1,
        consensusReached: true,
      };
    }

    const individualScores = scores.map((s) => ({
      model: s.model,
      score: s.score.score,
    }));

    // Calculate agreement
    const scoreValues = scores.map((s) => s.score.score);
    const agreement = this.calculateAgreement(scoreValues);

    // Check if consensus reached
    const consensusReached = agreement >= this.config.minAgreement;

    // Calculate final score based on voting strategy
    let finalScore: number;
    switch (this.config.votingStrategy) {
      case 'weighted':
        finalScore = this.weightedAverage(scores);
        break;
      case 'majority':
        finalScore = this.majorityVote(scores);
        break;
      default:
        finalScore = scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length;
    }

    return {
      score: Math.round(finalScore * 1000) / 1000,
      individualScores,
      agreement: Math.round(agreement * 1000) / 1000,
      consensusReached,
    };
  }

  /**
   * Calculate agreement using standard deviation
   */
  private calculateAgreement(scores: number[]): number {
    if (scores.length < 2) return 1;

    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    // Convert to agreement score (lower stdDev = higher agreement)
    return Math.max(0, 1 - stdDev * 2);
  }

  /**
   * Weighted average
   */
  private weightedAverage(scores: Array<{ model: string; score: JudgeScore }>): number {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const { model, score } of scores) {
      const modelConfig = this.config.models.find((m) => m.id === model);
      const weight = modelConfig?.weight || 1;
      weightedSum += score.score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Majority vote (weighted)
   */
  private majorityVote(scores: Array<{ model: string; score: JudgeScore }>): number {
    // Bin scores into categories
    const bins = { low: 0, medium: 0, high: 0 };

    for (const { model, score } of scores) {
      const modelConfig = this.config.models.find((m) => m.id === model);
      const weight = modelConfig?.weight || 1;

      if (score.score < 0.33) bins.low += weight;
      else if (score.score < 0.67) bins.medium += weight;
      else bins.high += weight;
    }

    const maxBin = Math.max(bins.low, bins.medium, bins.high);
    if (maxBin === bins.low) return 0.17;
    if (maxBin === bins.medium) return 0.5;
    return 0.83;
  }
}
