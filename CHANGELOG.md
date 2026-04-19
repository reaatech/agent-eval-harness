# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project structure and scaffolding
- Core domain types and Zod schemas
- Trajectory loader and evaluator
- Tool-use correctness validator
- Cost-per-task tracker
- Latency budget enforcer
- LLM-as-judge engine with calibration support
- Golden trajectory management
- Evaluation suite orchestration
- CI regression gates
- MCP server with three-layer architecture (eval.judge.*, eval.suite.*, eval.gate.*)
- Observability (OpenTelemetry tracing, metrics, structured logging)
- CLI tool with commands: eval, judge, compare, gate, golden, report
- Unit and integration tests
- Docker support with docker-compose for full observability stack
- GitHub Actions CI/CD workflows
- Documentation (README, AGENTS.md, ARCHITECTURE.md, CLAUDE.md)
- Example trajectories and configuration

### Changed
- None

### Deprecated
- None

### Removed
- None

### Fixed
- None

### Security
- None

---

## [0.1.0] - 2026-04-16

### Added
- Initial release with full evaluation harness
- Three-layer MCP tool architecture
- Provider-agnostic LLM judge
- CI-integrated regression gates
- Cost tracking and latency monitoring
- Golden trajectory support
