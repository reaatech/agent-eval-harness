# Skill: Golden Trajectories

## What It Is

Golden trajectories are reference implementations — perfect executions of agent scenarios used as benchmarks for regression testing. They define the expected behavior against which new runs are compared.

## Why It Matters

- **Regression Detection** — Catch quality degradation before production
- **Quality Baseline** — Define what "good" looks like
- **Consistent Evaluation** — Standardize quality assessment
- **Documentation** — Golden trajectories document expected behavior

## How to Use It

### CLI: Manage Golden Trajectories

```bash
# List all goldens
npx agent-eval-harness golden --list

# Create from a perfect run
npx agent-eval-harness golden --create trajectories/perfect-run.jsonl

# Validate a golden
npx agent-eval-harness golden --validate golden/my-golden.jsonl

# Compare against golden during eval
npx agent-eval-harness eval trajectories/run.jsonl \
  --golden golden/password-reset.jsonl \
  --output results/
```

### Load and Compare Against Golden

```typescript
import {
  loadGoldenTrajectories,
  compareAgainstGolden,
  loadFromFile,
} from '@reaatech/agent-eval-harness';

// loadGoldenTrajectories returns GoldenTrajectory[]
const goldens = await loadGoldenTrajectories('golden/password-reset.jsonl');
const golden = goldens[0];

// loadFromFile returns Trajectory[]
const trajectories = await loadFromFile('trajectories/new-run.jsonl');
const candidate = trajectories[0];

// compareAgainstGolden(golden: GoldenTrajectory, candidate: Trajectory, config?)
const result = compareAgainstGolden(golden, candidate, {
  similarityThreshold: 0.85,
});

console.log(`Similarity: ${(result.similarity * 100).toFixed(1)}%`);
console.log(`Regressions: ${result.regressions.length}`);

for (const regression of result.regressions) {
  console.log(`  - ${regression.metric}: ${regression.baseline} → ${regression.current}`);
}
```

### Batch Comparison

```typescript
import { batchCompare, findBestGolden } from '@reaatech/agent-eval-harness';

// Compare against multiple goldens
const results = batchCompare(goldens, candidate);
for (const r of results) {
  console.log(`${r.goldenId}: ${r.similarity}`);
}

// Find the best matching golden
const best = findBestGolden(goldens, candidate);
console.log(`Best match: ${best.goldenId} (${best.similarity})`);
```

### Golden Management

```typescript
import {
  createGolden,
  updateGolden,
  validateGolden,
  filterByTags,
  getByScenario,
  goldenToJSONL,
} from '@reaatech/agent-eval-harness';

const golden = createGolden(trajectory, {
  name: 'password-reset',
  tags: ['auth', 'account'],
  scenario: 'password-reset',
});

// Validate quality
const validation = validateGolden(golden);
console.log(`Valid: ${validation.valid}, Score: ${validation.score}`);

// Filter and retrieve
const authGoldens = filterByTags('golden/', ['auth']);
const scenarioGolden = getByScenario('golden/', 'password-reset');

// Export to JSONL string
const jsonl = goldenToJSONL(golden);
```

### Golden Curation Workflow

```typescript
import { createCurator, quickCreateGolden } from '@reaatech/agent-eval-harness';

// Full curation workflow (identify → annotate → validate → publish)
const curator = createCurator('my_suite');
curator.start(trajectory);
curator.annotateTurn(0, 'Polite greeting', true);
curator.runQualityChecks();
const golden = curator.publish();

// Quick creation for simple scenarios
const quick = quickCreateGolden(trajectory, { scenario: 'password-reset' });
```

## Key Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| `similarity` | Overall similarity to golden | >0.85 |
| `turn_similarity` | Per-turn similarity | >0.80 |
| `tool_similarity` | Tool usage similarity | >0.90 |
| `regressions` | Count of regressions | 0 |

## Best Practices

1. **Cover critical scenarios** — Create goldens for high-impact use cases
2. **Update regularly** — Keep goldens current with product changes
3. **Document quality notes** — Explain why each turn is good
4. **Use version control** — Track golden trajectory changes
5. **Set appropriate thresholds** — Balance sensitivity vs. noise

## Common Pitfalls

- **Too few goldens** — Cover all critical user journeys
- **Outdated goldens** — Review and update regularly
- **Unrealistic expectations** — Goldens should be achievable
- **No documentation** — Always add quality_notes

## Related Skills

- [Trajectory Evaluation](../trajectory-eval/skill.md)
- [Regression Suites](../regression-suites/skill.md)
- [Eval Gating](../eval-gating/skill.md)
