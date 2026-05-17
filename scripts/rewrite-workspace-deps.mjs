#!/usr/bin/env node

/**
 * Rewrites `workspace:*` protocol dependencies in package.json to concrete
 * caret-ranged versions (e.g. `^0.1.0`) by reading the published version from
 * each sibling package.
 *
 * Called from `prepublishOnly` so that the tarball uploaded to the registry
 * never ships `workspace:*` protocols.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, '..');
const packagesDir = resolve(workspaceRoot, 'packages');

const pkgPath = resolve(process.cwd(), 'package.json');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n');
}

const pkg = readJson(pkgPath);
const depFields = ['dependencies', 'devDependencies', 'peerDependencies'];

let changed = false;

for (const field of depFields) {
  const deps = pkg[field];
  if (!deps) continue;

  for (const [name, spec] of Object.entries(deps)) {
    if (spec !== 'workspace:*') continue;

    const suffix = name.replace('@reaatech/agent-eval-harness-', '');
    const siblingPkgPath = resolve(packagesDir, suffix, 'package.json');

    let version;
    try {
      const siblingPkg = readJson(siblingPkgPath);
      version = siblingPkg.version;
    } catch {
      console.warn(
        `[rewrite-workspace-deps] Could not resolve version for ${name} (expected at ${siblingPkgPath}) — skipping`
      );
      continue;
    }

    deps[name] = `^${version}`;
    changed = true;
    console.warn(`[rewrite-workspace-deps] ${name}: workspace:* → ^${version}`);
  }
}

if (changed) {
  writeJson(pkgPath, pkg);
} else {
  console.warn('[rewrite-workspace-deps] No workspace:* deps to rewrite');
}
