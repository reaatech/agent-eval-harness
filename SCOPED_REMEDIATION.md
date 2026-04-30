# SCOPED_REMEDIATION.md

A repeatable checklist for bringing a `@reaatech/*` TypeScript NPM repo into uniformity with the house standard. Designed to be executed by Claude Code (or a similarly capable agent) against any repo that currently uses some mix of npm + ESLint + Prettier + ad-hoc CI, with no guarantee of strict tsconfig or scoped package naming.

This is a checklist, not a script. Each step is a deliberate change with verification. Do not skip phases; ordering matters because later phases assume earlier ones (lockfile shape, lint config, etc.).

The reference implementation is `../a2a-reference-ts`. The worked single-package example is `../agent-eval-harness`.

---

## Target standards (canonical state)

Any repo finishing this remediation should match the following:

**Naming**
- npm package name is scoped: `@reaatech/<repo-name>` (single package) or `@reaatech/<repo-name>-<sub>` per package (monorepo)
- npm `bin` command stays UNSCOPED (e.g., `agent-eval-harness`, not `@reaatech/agent-eval-harness`) so users don't have to type the scope
- OTel service identifiers, Docker tags, repo URL, MCP server `name`, `DEBUG=...:*` namespace, commander program name → all stay unscoped
- `getLibraryInfo()`-style runtime metadata returns the scoped npm name

**Package manager**
- pnpm 10.x (`packageManager: "pnpm@10.x.x"` in `package.json`)
- `.npmrc` has `shamefully-hoist=false` and `strict-peer-dependencies=true`
- `pnpm-lock.yaml` is committed; `package-lock.json` is removed
- No `--legacy-peer-deps` workarounds anywhere — real peer dep conflicts get fixed at the source (range adjustment or `pnpm.overrides`)

**Lint + format**
- Biome 1.9.x, single tool for both
- `biome.json` matches reference: `noExplicitAny: error`, `noNonNullAssertion: error`, `recommended: true`, formatter line width 100, single quotes, trailing commas all
- ESLint, Prettier, `@typescript-eslint/*`, `typescript-eslint`, `@eslint/js` are uninstalled and their config files deleted

**TypeScript**
- TS 5.8.x (or whichever the reference currently pins)
- `tsconfig.json` has the full strict suite: `strict`, `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, `alwaysStrict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `allowUnreachableCode: false`, `allowUnusedLabels: false`, `isolatedModules`, `verbatimModuleSyntax`
- No invalid `ignoreDeprecations` value (a common source of pre-existing build failure)

**CI shape**
- `.github/workflows/ci.yml` has discrete jobs: `install → {audit, format, lint, typecheck} → build (uploads artifact) → {test (matrix node 20+22), coverage, docker-build, docker-compose} → all-checks` final gate
- `audit` uses `pnpm audit --audit-level moderate`
- `format` job runs `pnpm biome format --write . && git diff --exit-code` (catches non-idempotent formatting)
- All jobs use `pnpm/action-setup@v4` + `actions/setup-node@v4` with `cache: 'pnpm'`
- Concurrency group cancels in-progress runs

**Release shape**
- Tag-trigger (`v*`) for single-package; Changesets for monorepo
- `pnpm publish --access public` with `NPM_CONFIG_PROVENANCE: 'true'`
- GitHub Packages mirror step

**Repo metadata**
- Top-level `LICENSE` file (and per-package `LICENSE` for monorepos) — package.json's `"license": "MIT"` is meaningless without the file
- README install command shows the scoped name
- Skill/agent docs and CLAUDE.md import examples use the scoped name

---

## Phase 0 — Pre-flight inventory

Before changing anything, understand the starting state. If you can't answer these from a 5-minute read, stop and ask.

- [ ] Confirm working tree is **clean** (`git status` shows nothing). Stash hazards are real (see Pitfalls). If dirty, ask the user to commit or stash first.
- [ ] Confirm current branch is `main` (or whatever the user's main branch is). Don't do this on a feature branch unless explicitly asked.
- [ ] Read `package.json` end-to-end. Note: current name, version, bin commands, scripts, dep ranges, engines, packageManager.
- [ ] Identify shape: single-package (top-level `src/`, no `packages/`) or monorepo (`packages/*` + `pnpm-workspace.yaml`)?
- [ ] Identify package manager: presence of `package-lock.json` (npm), `pnpm-lock.yaml` (pnpm), `yarn.lock` (yarn).
- [ ] Identify linter: presence of `eslint.config.*`, `.eslintrc*`, `.prettierrc*`, `biome.json`.
- [ ] Identify CI: list `.github/workflows/*.yml`. Note any domain-specific workflows (e.g., `eval.yml`) that need preserving but adapting.
- [ ] Look for `LICENSE` file at top level. Often missing — it's a real bug.
- [ ] Run `pnpm audit --audit-level moderate` (or `npm audit`) and note any pre-existing vulnerabilities. They'll need overrides later.
- [ ] Check if `--legacy-peer-deps` appears anywhere (Dockerfile, CI workflow, scripts, README). Each occurrence is a marker for a peer-dep conflict that pnpm will surface.
- [ ] Check `tsconfig.json` for invalid `ignoreDeprecations` values. Anything other than `"5.0"` on TS 5.x will fail to build.
- [ ] Confirm node version target (`.nvmrc`, `engines.node`). The reference pins to Node 22.

**Ask the user, before any edit:**
- [ ] Naming: confirm new scoped package name (e.g., `@reaatech/<x>`). Should the existing project word ("harness", "ts", etc.) be kept or dropped?
- [ ] Shape: stay single-package or split to monorepo? (Splitting is a multi-hour refactor — only do it if the user explicitly asks.)
- [ ] Husky/lint-staged: keep (preserves pre-commit hooks) or drop (matches reference exactly)? Default: keep, rewrite for biome.

Save the answers in your task list. Do not infer.

---

## Phase 1 — Package naming and metadata

The smallest, lowest-risk phase. Do this first so version control history shows the rename clearly.

- [ ] Update `package.json`:
  - [ ] `name` → scoped form
  - [ ] Add `"publishConfig": { "access": "public" }` if not present (required for scoped packages on free npm orgs)
  - [ ] Verify `repository.url`, `bugs.url`, `homepage` still point at the existing GitHub repo (these usually don't change with the rename)
- [ ] Update `package-lock.json` (if it still exists at this stage — it'll be removed in Phase 3): both top-level `name` and `packages.""` entry
- [ ] Update README install command: `npm install <new-scoped-name>`
- [ ] Update import examples in docs:
  - [ ] `README.md`
  - [ ] `CLAUDE.md`
  - [ ] `AGENTS.md`
  - [ ] All `skills/*/skill.md` files
  - [ ] Any `WALKTHROUGH.md` / `ARCHITECTURE.md` / similar
- [ ] Update runtime metadata: any `getLibraryInfo()`-style function that returns the package name → use the scoped form
- [ ] Add `LICENSE` file at top level (MIT, copyright Rick Somers / reaatech) if missing
- [ ] **Do NOT change**: bin command name, OTel service names, MCP server name, `DEBUG=...:*` namespace, Docker image tag, commander program name, repo URL paths

**Verify:**
- [ ] `grep -rn "from '<old-name>'"` returns no matches in `*.ts` and `*.md` (excluding node_modules and dist)
- [ ] `grep -rn "install <old-name>"` returns no matches in `*.md`
- [ ] Repository URLs in `package.json` are still correct

---

## Phase 2 — Tooling swap (Biome + strict tsconfig)

This phase changes lint/format/typecheck behavior. Some existing code may surface violations.

- [ ] Create `biome.json` mirroring the reference:
  ```json
  {
    "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
    "files": { "ignore": ["dist", "node_modules", "coverage", "<repo-specific dirs>"] },
    "organizeImports": { "enabled": true },
    "linter": {
      "enabled": true,
      "rules": {
        "recommended": true,
        "suspicious": { "noExplicitAny": "error" },
        "style": { "noNonNullAssertion": "error" }
      }
    },
    "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
    "javascript": { "formatter": { "quoteStyle": "single", "trailingCommas": "all" } }
  }
  ```
- [ ] Add `<repo-specific dirs>` to ignore: any output, fixture, or generated dirs unique to the repo (`results/`, `trajectories/`, etc.)
- [ ] Delete: `eslint.config.*`, `.eslintrc*`, `.prettierrc*`, any `prettier.config.*`
- [ ] Update `package.json` scripts:
  - [ ] `lint` → `biome check .`
  - [ ] `lint:fix` → `biome check --write .`
  - [ ] `format` → `biome format --write .`
  - [ ] `format:check` → `biome format .`
- [ ] Update `package.json` devDependencies:
  - [ ] Add `@biomejs/biome: ^1.9.4`
  - [ ] Remove: `@eslint/js`, `eslint`, `@typescript-eslint/*`, `typescript-eslint`, `prettier`
  - [ ] **Audit and fix bogus version specs**: `typescript@^6.x.x` and similar future-versions don't exist — they cause silent lockfile drift. Align to reference's pins (TS `^5.8.3`, vitest `^3.2.4`, etc.) or whatever currently exists on registry.
- [ ] Update `.lintstagedrc.json` (if keeping husky):
  ```json
  {
    "*.{ts,js,json,jsonc}": ["biome check --write --no-errors-on-unmatched"],
    "*.{md,yaml,yml}": ["biome format --write --no-errors-on-unmatched"]
  }
  ```
- [ ] Tighten `tsconfig.json` to match reference's strict suite (see Target standards). Specifically:
  - [ ] Add: `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `alwaysStrict`, `isolatedModules`, `verbatimModuleSyntax`
  - [ ] **Remove** any invalid `ignoreDeprecations: "6.0"` (this is the cause of pre-existing build failures on TS 5.x)
  - [ ] Keep repo-specific bits: `outDir`, `rootDir`, `paths`, `types: ["node"]`

**Verify (deferred to after Phase 3, since deps aren't installed yet):**
- [ ] Note: do not try to run `pnpm lint` here — `@biomejs/biome` isn't installed until Phase 3.

---

## Phase 3 — Package manager migration (npm → pnpm)

This phase regenerates `node_modules` and surfaces real peer-dep conflicts that `--legacy-peer-deps` was hiding.

- [ ] Add to `package.json`: `"packageManager": "pnpm@10.22.0"` (or current reference pin)
- [ ] Create `.npmrc`:
  ```
  shamefully-hoist=false
  strict-peer-dependencies=true
  ```
- [ ] Delete `package-lock.json`
- [ ] Delete `node_modules/` (pnpm uses a different layout)
- [ ] Run `pnpm install`. **Expect peer-dep failures** if `--legacy-peer-deps` was previously needed. Common patterns:
  - [ ] `@opentelemetry/api ^1.8.0` resolving to 1.9.x but sdk-* requiring `<1.9.0` → pin api to `~1.8.0`
  - [ ] React peer-dep mismatches → align ranges across the React ecosystem
  - [ ] Two majors of a dep installed → pick one and pin
- [ ] Run `pnpm audit --audit-level moderate`. **Expect findings**. For deeply-nested transitive vulnerabilities that can't be fixed by a direct upgrade, add `pnpm.overrides`:
  ```json
  "pnpm": {
    "overrides": {
      "uuid@<14.0.0": ">=14.0.0"
    }
  }
  ```
- [ ] Update `Dockerfile`:
  - [ ] All stages: `RUN npm install -g pnpm@10` early
  - [ ] `COPY package.json pnpm-lock.yaml ./` (drop `package-lock.json`)
  - [ ] `RUN pnpm install --frozen-lockfile` (drop `--legacy-peer-deps`)
  - [ ] For prod-deps stage: `RUN pnpm install --prod --frozen-lockfile --ignore-scripts`
- [ ] Update `docker-compose.yml` if it references `npm` commands
- [ ] If husky `prepare` script exists, leave it alone — it works fine under pnpm

**Verify:**
- [ ] `pnpm install` succeeds with no peer-dep errors
- [ ] `pnpm audit --audit-level moderate` reports zero vulnerabilities
- [ ] `pnpm typecheck` is clean (the strict tsconfig from Phase 2 may surface real issues)
- [ ] `pnpm build` is clean
- [ ] `pnpm test` passes
- [ ] `pnpm lint` runs (may report many violations — addressed in Phase 6)

---

## Phase 4 — CI workflows

Rewrite `.github/workflows/ci.yml` from scratch matching the reference shape. Adapt domain-specific workflows.

- [ ] Backup any domain-specific workflow that needs preserving (e.g., `eval.yml` for an evaluation harness). Update its `npm`-isms to `pnpm` and inline its job into the new `ci.yml` `needs` graph.
- [ ] Replace `ci.yml` with the reference shape:
  - [ ] `install` job: pnpm setup, install, cache pnpm store + node_modules
  - [ ] `audit` job: independent — does not need `install`
  - [ ] `format`, `lint`, `typecheck` jobs: depend on `install`, restore cache
  - [ ] `build` job: depends on `[lint, typecheck]`, uploads `dist` artifact
  - [ ] `test` job: matrix `[20, 22]`, depends on `build`, downloads artifact
  - [ ] `coverage` job: depends on `build`, posts summary to `$GITHUB_STEP_SUMMARY`, uploads to Codecov
  - [ ] `docker-build` job: builds image without push
  - [ ] `docker-compose` job: runs `docker compose config` to validate
  - [ ] `all-checks` job: `if: always()`, depends on all preceding, asserts each `result == 'success'`
- [ ] Concurrency:
  ```yaml
  concurrency:
    group: ${{ github.workflow }}-${{ github.ref }}
    cancel-in-progress: true
  ```
- [ ] `format` job uses `pnpm biome format --write . && git diff --exit-code`. **Test idempotence locally first** — if biome wants to rewrite anything on a clean tree, the format job will fail forever.
- [ ] If a domain-specific eval workflow exists, wire it into the `needs` graph and into `all-checks`.

**Verify locally (the local CI rehearsal):**
- [ ] `pnpm exec biome format --write .` produces "No fixes applied" (idempotence)
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean (or only warnings if `noNonNullAssertion` is still at warn — see Phase 6)
- [ ] `pnpm build` clean
- [ ] `pnpm test` all green
- [ ] `pnpm audit --audit-level moderate` no vulnerabilities

---

## Phase 5 — Release workflow

Single-package: keep tag-trigger pattern. Monorepo: use Changesets.

- [ ] For single-package, rewrite `.github/workflows/release.yml`:
  - [ ] Trigger: `push.tags: ['v*']` and `workflow_dispatch`
  - [ ] Use pnpm setup
  - [ ] `pnpm publish --access public --no-git-checks` with `NPM_CONFIG_PROVENANCE: 'true'`
  - [ ] GitHub Packages mirror step (creates `.npmrc` with token, runs `pnpm publish` to `npm.pkg.github.com`)
  - [ ] Docker build/push to Docker Hub on tag
  - [ ] `softprops/action-gh-release@v2` for GitHub release
- [ ] For monorepo, copy reference's release.yml verbatim — it uses `changesets/action@v1` with `version: pnpm version-packages` and `publish: pnpm release`
- [ ] Add `id-token: write` permission for npm provenance
- [ ] Update README's release-installation snippet to show the scoped name

**Verify:**
- [ ] Workflow file passes `actionlint` if available, otherwise visual check
- [ ] All secret references are documented (NPM_TOKEN, DOCKER_USERNAME, DOCKER_PASSWORD)

---

## Phase 6 — Code-level cleanup (`noNonNullAssertion`)

The strict biome rule will report `value!` non-null-assertion sites that the previous lint config tolerated. The reference has zero such sites; full parity requires fixing each one.

- [ ] Run `pnpm lint --max-diagnostics=1000 2>&1 | grep noNonNullAssertion | wc -l` to count remaining sites
- [ ] If count is small (<5), just fix in place and move on
- [ ] If count is large (50+), decide with the user:
  - [ ] **Full parity**: fix every site (recommended — bounded work, real quality improvement)
  - [ ] **Soft parity**: downgrade rule to `warn` in `biome.json`, file a follow-up issue. CI passes but warnings surface in IDE/output.
- [ ] If fixing, work file-by-file using these patterns:

**Production code patterns:**
- `arr[i]!` after a length check → extract to const, add `if (!x) continue` (or `return`)
- `Map.has(k)` then `Map.get(k)!` → single `Map.get(k)` + null check
- `.filter(predicate).map(t => t.optional!)` → for-loop that pushes only when defined
- `matrix[i]![j]` (algorithm code with logical invariants) → cache row in local var with `?? []` fallback, use `(row[j] ?? 0) + 1` arithmetic

**Test code patterns:**
- `expect(x.optional!).toBeLessThan(y.optional!)` → `expect(x.optional as number).toBeLessThan(y.optional as number)` (the `as` is permitted; biome only flags `!`)
- `find().property!` → extract to const, `expect(c).toBeDefined()`, then `c?.property` (works for `expect(undefined).toBe(...)` because that fails informatively)
- `arr[0]!` in `JSON.parse(...)` or destructure → `arr[0] ?? ''` (parse will fail informatively if missing)

- [ ] After fixes, flip `noNonNullAssertion` to `error` in `biome.json`
- [ ] Run full pipeline: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — must be all green

---

## Common pitfalls and remediations

Real failures encountered during the reference run. Read this section before starting; reread when something blows up.

### `git stash` is hostile to multi-phase work

`git stash` does NOT stash untracked files by default. If you've created new files (`biome.json`, `.npmrc`, `pnpm-lock.yaml`) and stash to "test something briefly," they survive in the working tree, but tracked changes are reverted. Then `git stash pop` may fail with merge conflicts because the working tree drifted.

- [ ] **Rule**: do NOT `git stash` between phases. Either commit work-in-progress or use `git stash --include-untracked` and accept the recovery cost.
- [ ] If you accidentally stash and pop fails: `git checkout -- .` (revert tracked drift), then `git stash pop` again. Drop the stash only after confirming all expected files are present.

### Biome `--unsafe` removes `!` and breaks the build

`pnpm exec biome check --write --unsafe .` will replace `value!.foo` with `value?.foo`. This is a runtime semantic change: `?.` returns undefined where `!` would have produced a runtime crash on null. Type-checked code that relied on `!` for narrowing will then fail typecheck because `?.` propagates undefined.

- [ ] **Rule**: after running `--unsafe`, always run `pnpm typecheck`. Expect breakage. Common fix: extract value to const, add explicit null check.
- [ ] Real example: `const m = this.provider!.getMeter(...)` after `--unsafe` becomes `const m = this.provider?.getMeter(...)` — `m` is now `Meter | undefined`. Fix: add `if (!this.provider) return;` early-return at the top of the function.

### Pre-existing TypeScript build failure from invalid `ignoreDeprecations`

Repos with future-versioned tsconfig (e.g., `"ignoreDeprecations": "6.0"` while installed TS is 5.x) have been silently broken before remediation. Removing this in Phase 2 fixes the build incidentally. Do NOT misattribute the fix to your other Phase 2 changes.

### `--legacy-peer-deps` is a smell, not a fix

If the previous repo used `npm ci --legacy-peer-deps`, there are real peer-dep conflicts hidden in the dep tree. Phase 3's `pnpm install` will surface them. Do NOT try to silence pnpm with `strict-peer-dependencies=false` — that just moves the bug. Fix the underlying version range.

### Audit will find one transitive vulnerability

Almost every long-running TS repo has a moderate-severity finding in transitive deps (commonly `uuid <14`, `tar`, `semver`). Use `pnpm.overrides` in `package.json` to force the patched version. The reference repo ships clean audits — uniformity requires you do too.

### Biome formatter idempotence trap

The CI `format` job runs `biome format --write . && git diff --exit-code`. If `biome format` rewrites anything on a clean tree, the job fails forever. Test locally:

```bash
pnpm exec biome format --write .  # First run: may fix things
pnpm exec biome format --write .  # Second run: must say "No fixes applied"
```

If the second run still rewrites, biome's formatter is in conflict with itself or with another tool. Investigate before pushing.

### Algorithm code with `noUncheckedIndexedAccess`

Mathematical algorithms with array-of-array access (Levenshtein, dynamic programming, matrix ops) hit a wall: TS can't prove the indices are populated even when the algorithm guarantees it. Three options, in order of preference:

1. Cache rows in local vars with `?? []` fallback, use `(row[j] ?? 0) + arithmetic`. Algorithmically equivalent. **Preferred.**
2. Pre-allocate matrix with `Array.from({length: n}, () => new Array<number>(m).fill(0))` then `as number[]` casts on access. Less safe.
3. `// biome-ignore lint/style/noNonNullAssertion: <reason>` per line, with a clear explanation of the algorithmic invariant. **Only if (1) is genuinely uglier.**

### Husky postinstall ignored under `pnpm`

If `prepare: "husky"` runs but pre-commit hooks aren't firing, check `.husky/_/` exists. Some systems need `pnpm install` to run with `--ignore-scripts=false` (default) to actually invoke the prepare hook.

---

## Final verification matrix

The repo is "done" when ALL of these are green from a clean checkout:

| Check | Command | Expected |
|-------|---------|----------|
| Format idempotent | `pnpm exec biome format --write . && git diff --exit-code` | Exit 0, no diff |
| Lint clean | `pnpm lint` | 0 errors, 0 warnings |
| Typecheck clean | `pnpm typecheck` | Exit 0, no output |
| Build clean | `pnpm build` | Exit 0, `dist/` populated |
| Tests pass | `pnpm test` | All test files pass |
| Audit clean | `pnpm audit --audit-level moderate` | "No known vulnerabilities found" |
| Docker build | `docker build .` | Image built, no `--legacy-peer-deps` warnings |
| Package metadata | Manual: open `package.json` | Scoped name, `publishConfig`, `packageManager`, `pnpm.overrides` if needed |
| LICENSE present | `ls LICENSE` | File exists at top level |
| No old tooling | `find . -maxdepth 2 -name 'eslint.config*' -o -name '.prettierrc*' -o -name 'package-lock.json'` | No matches |
| README install correct | `grep "npm install" README.md` | Shows scoped name |
| No unscoped imports | `grep -rn "from '<old-name>'" --include='*.ts' --include='*.md' .` | No matches outside node_modules/dist |

If any check fails, do not call the remediation done. Ten minutes of follow-up beats a broken main branch.

---

## When NOT to use this checklist

- **Repos at v1.0+ with active consumers**: a package rename is a breaking change for downstream users. Coordinate or skip Phase 1.
- **Apps, not libraries**: skip the publishing-related items (Phase 5, scoped naming) and focus on tooling alignment.
- **Repos that already pass the verification matrix**: don't churn them. Run the matrix first; if it's all green, exit early.
