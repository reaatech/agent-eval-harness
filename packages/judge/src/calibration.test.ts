import { beforeEach, describe, expect, it } from 'vitest';
import { JudgeCalibrator } from './calibration.js';
import type { CalibrationResult, HumanLabel } from './calibration.js';
import type { JudgeScore } from './engine.js';

describe('JudgeCalibrator', () => {
  let calibrator: JudgeCalibrator;

  beforeEach(() => {
    calibrator = new JudgeCalibrator();
  });

  describe('constructor', () => {
    it('should default to temperature_scaling method', () => {
      const c = new JudgeCalibrator();
      expect(c).toBeDefined();
      expect(c.getIsCalibrated()).toBe(false);
    });

    it('should accept calibration method', () => {
      const c = new JudgeCalibrator('isotonic_regression');
      expect(c).toBeDefined();
    });

    it('should accept linear method', () => {
      const c = new JudgeCalibrator('linear');
      expect(c).toBeDefined();
    });
  });

  describe('addCalibrationData', () => {
    it('should accept human labels and judge scores', () => {
      const humanLabels: HumanLabel[] = [
        { sampleId: '1', score: 0.8, type: 'faithfulness' },
        { sampleId: '2', score: 0.6, type: 'faithfulness' },
      ];
      const judgeScores: JudgeScore[] = [
        { score: 0.75, explanation: 'test', confidence: 0.9, calibrated: false, rawScore: 0.7 },
        { score: 0.55, explanation: 'test', confidence: 0.8, calibrated: false, rawScore: 0.5 },
      ];

      expect(() => calibrator.addCalibrationData(humanLabels, judgeScores)).not.toThrow();
    });

    it('should match judge scores with rawScore defined', () => {
      const humanLabels: HumanLabel[] = [
        { sampleId: '1', score: 0.9, type: 'relevance' },
        { sampleId: '2', score: 0.7, type: 'relevance' },
        { sampleId: '3', score: 0.5, type: 'relevance' },
      ];
      const judgeScores: JudgeScore[] = [
        { score: 0.85, explanation: 'e1', confidence: 0.9, calibrated: false, rawScore: 0.85 },
        { score: 0.65, explanation: 'e2', confidence: 0.8, calibrated: false, rawScore: 0.65 },
        { score: 0.45, explanation: 'e3', confidence: 0.7, calibrated: false, rawScore: 0.45 },
      ];

      calibrator.addCalibrationData(humanLabels, judgeScores);
      const result = calibrator.calibrate();

      expect(result.sampleCount).toBe(3);
    });
  });

  describe('calibrate', () => {
    it('should calibrate with temperature_scaling', () => {
      const humanLabels: HumanLabel[] = [
        { sampleId: '1', score: 0.8, type: 'faithfulness' },
        { sampleId: '2', score: 0.6, type: 'faithfulness' },
        { sampleId: '3', score: 0.9, type: 'faithfulness' },
        { sampleId: '4', score: 0.4, type: 'faithfulness' },
      ];
      const judgeScores: JudgeScore[] = [
        { score: 0.75, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.7 },
        { score: 0.55, explanation: 'e', confidence: 0.8, calibrated: false, rawScore: 0.5 },
        { score: 0.85, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.85 },
        { score: 0.35, explanation: 'e', confidence: 0.7, calibrated: false, rawScore: 0.35 },
      ];

      calibrator.addCalibrationData(humanLabels, judgeScores);
      const result: CalibrationResult = calibrator.calibrate();

      expect(result.method).toBe('temperature_scaling');
      expect(result.sampleCount).toBe(4);
      expect(result.beforeMAE).toBeGreaterThanOrEqual(0);
      expect(result.afterMAE).toBeGreaterThanOrEqual(0);
      expect(result.improvement).toBeDefined();
      expect(result.parameters).toBeDefined();
      expect(result.parameters.temperature).toBeDefined();
    });

    it('should calibrate with isotonic_regression', () => {
      const c = new JudgeCalibrator('isotonic_regression');
      const humanLabels: HumanLabel[] = [
        { sampleId: '1', score: 0.9, type: 'relevance' },
        { sampleId: '2', score: 0.7, type: 'relevance' },
        { sampleId: '3', score: 0.3, type: 'relevance' },
      ];
      const judgeScores: JudgeScore[] = [
        { score: 0.85, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.85 },
        { score: 0.65, explanation: 'e', confidence: 0.8, calibrated: false, rawScore: 0.65 },
        { score: 0.35, explanation: 'e', confidence: 0.7, calibrated: false, rawScore: 0.35 },
      ];

      c.addCalibrationData(humanLabels, judgeScores);
      const result = c.calibrate();

      expect(result.method).toBe('isotonic_regression');
      expect(result.sampleCount).toBe(3);
      expect(result.parameters.scale).toBeDefined();
      expect(result.parameters.offset).toBeDefined();
    });

    it('should calibrate with linear method', () => {
      const c = new JudgeCalibrator('linear');
      const humanLabels: HumanLabel[] = [
        { sampleId: '1', score: 0.8, type: 'quality' },
        { sampleId: '2', score: 0.5, type: 'quality' },
        { sampleId: '3', score: 0.2, type: 'quality' },
      ];
      const judgeScores: JudgeScore[] = [
        { score: 0.75, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.75 },
        { score: 0.45, explanation: 'e', confidence: 0.8, calibrated: false, rawScore: 0.45 },
        { score: 0.15, explanation: 'e', confidence: 0.7, calibrated: false, rawScore: 0.15 },
      ];

      c.addCalibrationData(humanLabels, judgeScores);
      const result = c.calibrate();

      expect(result.method).toBe('linear');
      expect(result.sampleCount).toBe(3);
      expect(result.parameters.slope).toBeDefined();
      expect(result.parameters.intercept).toBeDefined();
    });

    it('should throw if fewer than 3 calibration points', () => {
      const humanLabels: HumanLabel[] = [{ sampleId: '1', score: 0.8, type: 'faithfulness' }];
      const judgeScores: JudgeScore[] = [
        { score: 0.75, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.7 },
      ];

      calibrator.addCalibrationData(humanLabels, judgeScores);
      expect(() => calibrator.calibrate()).toThrow('Need at least 3 calibration points');
    });

    it('should throw with no calibration data', () => {
      expect(() => calibrator.calibrate()).toThrow('Need at least 3 calibration points');
    });

    it('should set calibrated state to true after calibrate', () => {
      const humanLabels: HumanLabel[] = [
        { sampleId: '1', score: 0.8, type: 'faithfulness' },
        { sampleId: '2', score: 0.6, type: 'faithfulness' },
        { sampleId: '3', score: 0.9, type: 'faithfulness' },
      ];
      const judgeScores: JudgeScore[] = [
        { score: 0.75, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.7 },
        { score: 0.55, explanation: 'e', confidence: 0.8, calibrated: false, rawScore: 0.5 },
        { score: 0.85, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.85 },
      ];

      calibrator.addCalibrationData(humanLabels, judgeScores);
      expect(calibrator.getIsCalibrated()).toBe(false);

      calibrator.calibrate();
      expect(calibrator.getIsCalibrated()).toBe(true);
    });
  });

  describe('apply', () => {
    it('should return raw score when not calibrated', () => {
      expect(calibrator.apply(0.75)).toBe(0.75);
    });

    it('should return raw score when not calibrated for edge values', () => {
      expect(calibrator.apply(0)).toBe(0);
      expect(calibrator.apply(1)).toBe(1);
    });

    it('should return calibrated score after calibration', () => {
      const humanLabels: HumanLabel[] = [
        { sampleId: '1', score: 0.8, type: 'faithfulness' },
        { sampleId: '2', score: 0.6, type: 'faithfulness' },
        { sampleId: '3', score: 0.9, type: 'faithfulness' },
        { sampleId: '4', score: 0.4, type: 'faithfulness' },
        { sampleId: '5', score: 0.7, type: 'faithfulness' },
      ];
      const judgeScores: JudgeScore[] = [
        { score: 0.75, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.7 },
        { score: 0.55, explanation: 'e', confidence: 0.8, calibrated: false, rawScore: 0.5 },
        { score: 0.85, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.85 },
        { score: 0.35, explanation: 'e', confidence: 0.7, calibrated: false, rawScore: 0.35 },
        { score: 0.65, explanation: 'e', confidence: 0.8, calibrated: false, rawScore: 0.65 },
      ];

      calibrator.addCalibrationData(humanLabels, judgeScores);
      calibrator.calibrate();

      const result = calibrator.apply(0.75);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    });

    it('should produce different output than input when calibrated', () => {
      const humanLabels: HumanLabel[] = [
        { sampleId: '1', score: 0.9, type: 'relevance' },
        { sampleId: '2', score: 0.3, type: 'relevance' },
        { sampleId: '3', score: 0.6, type: 'relevance' },
        { sampleId: '4', score: 0.1, type: 'relevance' },
      ];
      const judgeScores: JudgeScore[] = [
        { score: 0.85, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.8 },
        { score: 0.35, explanation: 'e', confidence: 0.8, calibrated: false, rawScore: 0.3 },
        { score: 0.55, explanation: 'e', confidence: 0.7, calibrated: false, rawScore: 0.5 },
        { score: 0.15, explanation: 'e', confidence: 0.6, calibrated: false, rawScore: 0.1 },
      ];

      calibrator.addCalibrationData(humanLabels, judgeScores);
      calibrator.calibrate();

      const result = calibrator.apply(0.5);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    });

    it('should clamp output to 0-1 range', () => {
      const humanLabels: HumanLabel[] = [
        { sampleId: '1', score: 0.8, type: 'faithfulness' },
        { sampleId: '2', score: 0.6, type: 'faithfulness' },
        { sampleId: '3', score: 0.9, type: 'faithfulness' },
      ];
      const judgeScores: JudgeScore[] = [
        { score: 0.75, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.7 },
        { score: 0.55, explanation: 'e', confidence: 0.8, calibrated: false, rawScore: 0.5 },
        { score: 0.85, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.85 },
      ];

      calibrator.addCalibrationData(humanLabels, judgeScores);
      calibrator.calibrate();

      expect(calibrator.apply(0)).toBeGreaterThanOrEqual(0);
      expect(calibrator.apply(1)).toBeLessThanOrEqual(1);
    });
  });

  describe('getIsCalibrated', () => {
    it('should return false before calibration', () => {
      expect(calibrator.getIsCalibrated()).toBe(false);
    });

    it('should return true after successful calibration', () => {
      const humanLabels: HumanLabel[] = [
        { sampleId: '1', score: 0.8, type: 'faithfulness' },
        { sampleId: '2', score: 0.6, type: 'faithfulness' },
        { sampleId: '3', score: 0.9, type: 'faithfulness' },
      ];
      const judgeScores: JudgeScore[] = [
        { score: 0.75, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.7 },
        { score: 0.55, explanation: 'e', confidence: 0.8, calibrated: false, rawScore: 0.5 },
        { score: 0.85, explanation: 'e', confidence: 0.9, calibrated: false, rawScore: 0.85 },
      ];

      calibrator.addCalibrationData(humanLabels, judgeScores);
      calibrator.calibrate();
      expect(calibrator.getIsCalibrated()).toBe(true);
    });
  });
});
