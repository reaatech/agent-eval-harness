import { beforeEach, describe, expect, it } from 'vitest';
import { PairedPolarityChecker } from './polarity.js';
import type { PolarityResult } from './polarity.js';

describe('PairedPolarityChecker', () => {
  let checker: PairedPolarityChecker;

  beforeEach(() => {
    checker = new PairedPolarityChecker();
  });

  describe('constructor', () => {
    it('should use default thresholds', () => {
      expect(checker).toBeDefined();
    });

    it('should accept custom thresholds', () => {
      const c = new PairedPolarityChecker({ contestedThreshold: 0.3, confirmedThreshold: 0.7 });
      expect(c).toBeDefined();
    });

    it('should accept partial config', () => {
      const c = new PairedPolarityChecker({ contestedThreshold: 0.2 });
      const result = c.classify('test claim', 'test claim reversed', 0.7, 0.7);
      expect(result.originalVerdict).toBe('CONFIRMED');
    });
  });

  describe('checkInversion', () => {
    it('should detect weak inversion with "not" prefix', () => {
      const result = checker.checkInversion('the sky is blue', 'not the sky is blue');
      expect(result).toBe('INVERSION_WEAK');
    });

    it('should detect weak inversion with "never" prefix', () => {
      const result = checker.checkInversion('it rains', 'never it rains');
      expect(result).toBe('INVERSION_WEAK');
    });

    it('should detect weak inversion with "no" prefix', () => {
      const result = checker.checkInversion('errors exist', 'no errors exist');
      expect(result).toBe('INVERSION_WEAK');
    });

    it('should detect weak inversion with "it is not true that" prefix', () => {
      const result = checker.checkInversion(
        'the answer is 42',
        'it is not true that the answer is 42',
      );
      expect(result).toBe('INVERSION_WEAK');
    });

    it('should return strong inversion for non-mechanical negation', () => {
      const result = checker.checkInversion('the sky is blue', 'the sky is green');
      expect(result).toBe('INVERSION_STRONG');
    });
  });

  describe('classify', () => {
    it('should classify as ASYMMETRIC when original confirmed and inverted contested', () => {
      const result = checker.classify('claim', 'the opposite of claim', 0.85, 0.15);
      expect(result.originalVerdict).toBe('CONFIRMED');
      expect(result.invertedVerdict).toBe('CONTESTED');
      expect(result.classification).toBe('ASYMMETRIC');
      expect(result.explanation).toContain('higher-confidence signal');
    });

    it('should classify as ASYMMETRIC when original contested and inverted confirmed', () => {
      const result = checker.classify('claim', 'the opposite of claim', 0.2, 0.9);
      expect(result.originalVerdict).toBe('CONTESTED');
      expect(result.invertedVerdict).toBe('CONFIRMED');
      expect(result.classification).toBe('ASYMMETRIC');
    });

    it('should classify as ARTIFACT when both CONFIRMED', () => {
      const result = checker.classify('claim', 'the opposite of claim', 0.85, 0.8);
      expect(result.originalVerdict).toBe('CONFIRMED');
      expect(result.invertedVerdict).toBe('CONFIRMED');
      expect(result.classification).toBe('ARTIFACT');
      expect(result.explanation).toContain('likely judge artifact');
    });

    it('should classify as ARTIFACT when both CONTESTED', () => {
      const result = checker.classify('claim', 'the opposite of claim', 0.2, 0.1);
      expect(result.originalVerdict).toBe('CONTESTED');
      expect(result.invertedVerdict).toBe('CONTESTED');
      expect(result.classification).toBe('ARTIFACT');
    });

    it('should classify as PARTIAL when original is UNCERTAIN', () => {
      const result = checker.classify('claim', 'the opposite of claim', 0.5, 0.85);
      expect(result.originalVerdict).toBe('UNCERTAIN');
      expect(result.classification).toBe('PARTIAL');
      expect(result.explanation).toContain('partial signal');
    });

    it('should classify as PARTIAL when inverted is UNCERTAIN', () => {
      const result = checker.classify('claim', 'the opposite of claim', 0.85, 0.5);
      expect(result.invertedVerdict).toBe('UNCERTAIN');
      expect(result.classification).toBe('PARTIAL');
    });

    it('should mark weak inversion with appropriate explanation', () => {
      const result = checker.classify('the sky is blue', 'not the sky is blue', 0.85, 0.15);
      expect(result.inversionStrength).toBe('INVERSION_WEAK');
      expect(result.explanation).toBe(
        'Inversion is a mechanical negation; verdict pair may not be meaningful',
      );
    });

    it('should handle boundary scores at contested threshold', () => {
      const result = checker.classify('claim', 'the opposite of claim', 0.4, 0.85);
      expect(result.originalVerdict).toBe('CONTESTED');
    });

    it('should handle boundary scores at confirmed threshold', () => {
      const result = checker.classify('claim', 'the opposite of claim', 0.85, 0.6);
      expect(result.invertedVerdict).toBe('CONFIRMED');
    });

    it('should return UNCERTAIN for scores in the middle range', () => {
      const result = checker.classify('claim', 'the opposite of claim', 0.5, 0.55);
      expect(result.originalVerdict).toBe('UNCERTAIN');
      expect(result.invertedVerdict).toBe('UNCERTAIN');
      expect(result.classification).toBe('PARTIAL');
    });
  });

  describe('evaluate', () => {
    it('should handle empty claims', () => {
      const result: PolarityResult = checker.evaluate([]);
      expect(result.totalClaims).toBe(0);
      expect(result.asymmetricCount).toBe(0);
      expect(result.artifactCount).toBe(0);
      expect(result.nullCount).toBe(0);
      expect(result.partialCount).toBe(0);
    });

    it('should evaluate a single claim', () => {
      const result = checker.evaluate([
        {
          claim: 'claim',
          inversion: 'the opposite of claim',
          originalScore: 0.85,
          invertedScore: 0.15,
        },
      ]);
      expect(result.totalClaims).toBe(1);
      expect(result.asymmetricCount).toBe(1);
    });

    it('should evaluate multiple claims and count classifications', () => {
      const result = checker.evaluate([
        {
          claim: 'c1',
          inversion: 'not c1',
          originalScore: 0.85,
          invertedScore: 0.15,
        },
        {
          claim: 'c2',
          inversion: 'the opposite of c2',
          originalScore: 0.9,
          invertedScore: 0.85,
        },
        {
          claim: 'c3',
          inversion: 'the opposite of c3',
          originalScore: 0.5,
          invertedScore: 0.9,
        },
      ]);
      expect(result.totalClaims).toBe(3);
      expect(result.asymmetricCount).toBe(1);
      expect(result.artifactCount).toBe(1);
      expect(result.partialCount).toBe(1);
      expect(result.nullCount).toBe(0);
    });

    it('should return all claims with their verdicts', () => {
      const result = checker.evaluate([
        {
          claim: 'c1',
          inversion: 'the opposite of c1',
          originalScore: 0.85,
          invertedScore: 0.15,
        },
      ]);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claim).toBe('c1');
      expect(result.claims[0].inversion).toBe('the opposite of c1');
      expect(result.claims[0].originalScore).toBe(0.85);
      expect(result.claims[0].invertedScore).toBe(0.15);
    });
  });
});
