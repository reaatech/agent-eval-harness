/**
 * Per-claim verdict from a single channel
 */
export type Verdict = 'CONFIRMED' | 'CONTESTED' | 'UNCERTAIN';

/**
 * Semantic inversion strength
 */
export type InversionStrength = 'INVERSION_WEAK' | 'INVERSION_STRONG';

/**
 * Symmetry classification of a verdict pair
 */
export type PairClassification = 'ASYMMETRIC' | 'ARTIFACT' | 'NULL' | 'PARTIAL';

/**
 * Paired verdict for a single claim evaluated through both channels
 */
export interface PairedVerdict {
  claim: string;
  inversion: string;
  originalVerdict: Verdict;
  invertedVerdict: Verdict;
  originalScore: number;
  invertedScore: number;
  inversionStrength: InversionStrength;
  classification: PairClassification;
  explanation: string | undefined;
}

/**
 * Polarity check result for a set of claims
 */
export interface PolarityResult {
  claims: PairedVerdict[];
  asymmetricCount: number;
  artifactCount: number;
  nullCount: number;
  partialCount: number;
  totalClaims: number;
}

/**
 * Configuration for polarity checking
 */
export interface PolarityConfig {
  /** Score threshold below which a verdict is CONTESTED (default 0.4) */
  contestedThreshold?: number;
  /** Score threshold above which a verdict is CONFIRMED (default 0.6) */
  confirmedThreshold?: number;
}

const WEAK_INVERSION_PATTERNS = [
  /^(not|no|never)\s/i,
  /^(doesn't|didn't|won't|wouldn't|shouldn't|couldn't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|can't)\s/i,
  /^(it is not true that|it is false that)\s/i,
];

function detectInversionStrength(original: string, inversion: string): InversionStrength {
  const trimmed = inversion.trim();

  // Check if the inversion is a mechanical negation
  for (const pattern of WEAK_INVERSION_PATTERNS) {
    if (pattern.test(trimmed)) {
      const rest = trimmed.replace(pattern, '').trim().toLowerCase();
      if (original.toLowerCase().includes(rest) || rest.includes(original.toLowerCase())) {
        return 'INVERSION_WEAK';
      }
    }
  }

  return 'INVERSION_STRONG';
}

function scoreToVerdict(
  score: number,
  contestedThreshold: number,
  confirmedThreshold: number,
): Verdict {
  if (score <= contestedThreshold) return 'CONTESTED';
  if (score >= confirmedThreshold) return 'CONFIRMED';
  return 'UNCERTAIN';
}

function classifyPair(originalVerdict: Verdict, invertedVerdict: Verdict): PairClassification {
  if (originalVerdict === 'CONFIRMED' && invertedVerdict === 'CONTESTED') return 'ASYMMETRIC';
  if (originalVerdict === 'CONTESTED' && invertedVerdict === 'CONFIRMED') return 'ASYMMETRIC';
  if (originalVerdict === 'UNCERTAIN' || invertedVerdict === 'UNCERTAIN') return 'PARTIAL';
  return 'ARTIFACT';
}

/**
 * Checks paired-polarity for a set of claims.
 *
 * Score each claim through two channels — the original claim AND its semantic
 * inversion — and uses the asymmetric verdict shape as a higher-confidence
 * signal. Symmetric verdicts (both CONFIRMED or both CONTESTED) flag a likely
 * judge artifact.
 */
export class PairedPolarityChecker {
  private config: Required<PolarityConfig>;

  constructor(config: PolarityConfig = {}) {
    this.config = {
      contestedThreshold: config.contestedThreshold ?? 0.4,
      confirmedThreshold: config.confirmedThreshold ?? 0.6,
    };
  }

  /**
   * Faithfulness pre-check on an inversion.
   * Returns INVERSION_WEAK when the inversion is a mechanical "not-X" negation
   * that should not enter the audit as a meaningful counterpoint.
   */
  checkInversion(original: string, inversion: string): InversionStrength {
    return detectInversionStrength(original, inversion);
  }

  /**
   * Classify a single paired-polarity verdict.
   */
  classify(
    claim: string,
    inversion: string,
    originalScore: number,
    invertedScore: number,
  ): PairedVerdict {
    const inversionStrength = detectInversionStrength(claim, inversion);
    const originalVerdict = scoreToVerdict(
      originalScore,
      this.config.contestedThreshold,
      this.config.confirmedThreshold,
    );
    const invertedVerdict = scoreToVerdict(
      invertedScore,
      this.config.contestedThreshold,
      this.config.confirmedThreshold,
    );
    const classification = classifyPair(originalVerdict, invertedVerdict);

    let explanation: string | undefined;
    if (inversionStrength === 'INVERSION_WEAK') {
      explanation = 'Inversion is a mechanical negation; verdict pair may not be meaningful';
    } else if (classification === 'ASYMMETRIC') {
      explanation = `Original ${originalVerdict} / inverted ${invertedVerdict} — higher-confidence signal`;
    } else if (classification === 'ARTIFACT') {
      explanation = `Symmetric verdict (original ${originalVerdict}, inverted ${invertedVerdict}) — likely judge artifact`;
    } else if (classification === 'PARTIAL') {
      explanation = `One channel returned an uncertain verdict (original ${originalVerdict}, inverted ${invertedVerdict}) — partial signal`;
    }

    return {
      claim,
      inversion,
      originalVerdict,
      invertedVerdict,
      originalScore,
      invertedScore,
      inversionStrength,
      classification,
      explanation,
    };
  }

  /**
   * Score polarity across a set of claim/inversion pairs.
   */
  evaluate(
    claims: Array<{
      claim: string;
      inversion: string;
      originalScore: number;
      invertedScore: number;
    }>,
  ): PolarityResult {
    const results = claims.map((c) =>
      this.classify(c.claim, c.inversion, c.originalScore, c.invertedScore),
    );

    let asymmetricCount = 0;
    let artifactCount = 0;
    let nullCount = 0;
    let partialCount = 0;

    for (const r of results) {
      if (r.classification === 'ASYMMETRIC') asymmetricCount++;
      else if (r.classification === 'ARTIFACT') artifactCount++;
      else if (r.classification === 'NULL') nullCount++;
      else if (r.classification === 'PARTIAL') partialCount++;
    }

    return {
      claims: results,
      asymmetricCount,
      artifactCount,
      nullCount,
      partialCount,
      totalClaims: results.length,
    };
  }
}
