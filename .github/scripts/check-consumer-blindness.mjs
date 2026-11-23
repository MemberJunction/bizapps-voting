#!/usr/bin/env node
/**
 * Consumer-blindness check: ensure that Voting code never names host apps.
 *
 * Scans packages/pkg/src (excluding generated and __tests__) and metadata files for
 * case-insensitive whole-word matches of host app names:
 * - 'committee', 'committees'
 * - 'collaboration'
 * - 'orders'
 * - 'forms' (scoped to strings like 'bizapps-forms' / 'mj-biz-apps/forms')
 * - 'bizapps-' packages except voting or common
 * - '@mj-biz-apps/' packages except voting-* or common-*
 *
 * Violations are reported as file:line list. Allow-list via `consumer-blindness-ok`
 * comment on the same line as the violation.
 *
 * Exit codes:
 *  0 = no violations
 *  1 = violations found
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');

// Patterns that are never allowed (whole-word, case-insensitive)
const forbiddenPatterns = [
  /\bcommittee\b/i,
  /\bcommittees\b/i,
  /\bcollaboration\b/i,
  /\borders\b/i,
  // forms is scoped to package names
  /bizapps-(?!voting|common)\w+/i,
  /@mj-biz-apps\/(?!voting-|common-)\w+/i,
];

// Forms-specific scoping: only forbidden in package-name contexts
const formsForbiddenPatterns = [
  /bizapps-forms/i,
  /@mj-biz-apps\/forms/i,
  /['"]forms['"]\s*(?:,|:)/, // as a JSON/JS string
];

const violations = [];

/**
 * Scan a directory tree for violations.
 * @param {string} dir - directory to scan
 * @param {boolean} isMetadata - whether we're scanning metadata/ (stricter)
 */
function scanDir(dir, isMetadata = false) {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Skip node_modules and .git
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
      continue;
    }

    // Skip generated and test directories in packages/*/src
    if (entry.name === 'generated' || entry.name === '__tests__') {
      continue;
    }

    if (entry.isDirectory()) {
      scanDir(fullPath, isMetadata);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js') || entry.name.endsWith('.json'))) {
      checkFile(fullPath, isMetadata);
    }
  }
}

/**
 * Check a single file for violations.
 * @param {string} filePath - file to check
 * @param {boolean} isMetadata - whether this is a metadata file
 */
function checkFile(filePath, isMetadata) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, lineNum) => {
      const lineNumber = lineNum + 1;

      // Check for allow-list comment
      if (line.includes('consumer-blindness-ok')) {
        return;
      }

      // In metadata files, skip Description/description and Note/note fields that are purely
      // documentary — they explain use cases, not code dependencies.
      if (isMetadata && (/^\s*["']?(?:Description|Note|description|note)["']?\s*:/.test(line))) {
        return;
      }

      // Check forbidden patterns
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(line)) {
          violations.push({ file: filePath, line: lineNumber, match: line.trim() });
          return;
        }
      }

      // Check forms-specific patterns
      if (/\bforms\b/i.test(line)) {
        for (const pattern of formsForbiddenPatterns) {
          if (pattern.test(line)) {
            violations.push({ file: filePath, line: lineNumber, match: line.trim() });
            return;
          }
        }
      }
    });
  } catch (err) {
    // Skip files we can't read
  }
}

// Scan packages and metadata
const packagesDir = path.join(repoRoot, 'packages');
const metadataDir = path.join(repoRoot, 'metadata');

console.log('Scanning for consumer-blindness violations...');
scanDir(packagesDir, false);
scanDir(metadataDir, true);

if (violations.length === 0) {
  console.log('✓ No consumer-blindness violations found.');
  process.exit(0);
} else {
  console.error(`✗ Found ${violations.length} violation(s):`);
  for (const v of violations) {
    const rel = path.relative(repoRoot, v.file);
    console.error(`  ${rel}:${v.line}`);
  }
  process.exit(1);
}
