# End-to-End Walkthrough

This guide walks you through the complete flow: install → load trajectories → run evaluation → generate report.

## Prerequisites

- Node.js 22+ (`nvm use` if you have .nvmrc)
- npm or pnpm
- (Optional) Docker for containerized deployment

## Step 1: Install

```bash
# Clone the repository
git clone https://github.com/reaatech/agent-eval-harness.git
cd agent-eval-harness

# Install dependencies
npm install

# Verify installation
npx agent-eval-harness --version
```

## Step 2: Load Trajectories

Create or use existing trajectory files in JSONL format:

```bash
# View example trajectories
cat trajectories/examples/sample.jsonl

# Expected output:
# {"turn_id": 1, "role": "user", "content": "Reset my password", "timestamp": "2026-04-15T23:00:00Z"}
# {"turn_id": 1, "role": "agent", "content": "I can help with that. What's your email?", "tool_calls": [], "timestamp": "2026-04-15T23:00:01Z"}
# ...
```

### Create Your Own Trajectory

```bash
cat > trajectories/my-run.jsonl << 'EOF'
{"turn_id": 1, "role": "user", "content": "What's my account email?", "timestamp": "2026-04-16T10:00:00Z"}
{"turn_id": 1, "role": "agent", "content": "Your account is associated with john@example.com", "tool_calls": [], "timestamp": "2026-04-16T10:00:01Z", "latency_ms": 1200}
{"turn_id": 2, "role": "user", "content": "Thanks!", "timestamp": "2026-04-16T10:00:05Z"}
{"turn_id": 2, "role": "agent", "content": "You're welcome! Anything else I can help with?", "tool_calls": [], "timestamp": "2026-04-16T10:00:06Z", "latency_ms": 800}
EOF
```

## Step 3: Run Evaluation

### Basic Evaluation

```bash
npx agent-eval-harness eval trajectories/my-run.jsonl --output results/
```

### Full Evaluation with All Metrics

```bash
npx agent-eval-harness eval trajectories/*.jsonl \
  --config trajectories/examples/config.yaml \
  --golden golden/ \
  --judge-model claude-opus \
  --budget 10.00 \
  --output results/
```

### View Results

```bash
cat results/eval-*.json | jq .
```

## Step 4: Generate Report

### Quick Report

```bash
npx agent-eval-harness report results/eval-*.json --format markdown --output report.md
```

### Detailed Report with Comparison

```bash
# First, set a baseline
cp results/eval-001.json results/baseline.json

# Run new evaluation
npx agent-eval-harness eval trajectories/new-run.jsonl --output results/

# Compare
npx agent-eval-harness compare results/baseline.json results/eval-002.json \
  --format markdown \
  --output comparison-report.md
```

## Step 5: CI Integration

### Run Gates

```bash
npx agent-eval-harness gate \
  --results results/eval-002.json \
  --gates gates.yaml \
  --baseline results/baseline.json

# Exit code 0 = passed, 1 = failed
```

### GitHub Actions

The repository includes pre-configured workflows:

```yaml
# .github/workflows/eval.yml runs automatically on PRs
# View results in the Actions tab
```

## Troubleshooting

### Common Issues

1. **Missing dependencies**
   ```bash
   npm install
   ```

2. **Invalid trajectory format**
   ```bash
    # Validate trajectory
    npx agent-eval-harness eval trajectories/my-run.jsonl --no-judge --output /dev/null
   ```

3. **Budget exceeded**
   ```bash
   # Increase budget or reduce judge usage
   npx agent-eval-harness eval ... --budget 20.00
   ```

### Get Help

```bash
npx agent-eval-harness --help
npx agent-eval-harness eval --help
```

## Next Steps

- Read the full [README.md](README.md)
- Explore [skills/](skills/) for detailed usage patterns
- Check [CLAUDE.md](CLAUDE.md) for development guide
- Review [ARCHITECTURE.md](ARCHITECTURE.md) for system design
