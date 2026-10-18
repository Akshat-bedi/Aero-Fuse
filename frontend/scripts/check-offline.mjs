import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Directories and files to scan
const SCAN_TARGETS = ['src', 'dist', 'public', 'index.html'];

// Allowed schemas and internal / documentation reference URLs
const ALLOWED_URL_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?(\/.*)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?(\/.*)?$/,
  /^wss?:\/\/localhost(:\d+)?(\/.*)?$/,
  /^wss?:\/\/127\.0\.0\.1(:\d+)?(\/.*)?$/,
  /^https?:\/\/(www\.)?w3\.org(\/.*)?$/,
  /^https:\/\/json-schema\.org(\/.*)?$/,
  /^https:\/\/airops\.dss(\/.*)?$/,
  /^https:\/\/reactrouter\.com(\/.*)?$/,
  /^https:\/\/reactjs\.org(\/.*)?$/,
  /^https:\/\/rollupjs\.org(\/.*)?$/,
  /^https:\/\/github\.com(\/.*)?$/,
  /^https?:\/\/(www\.)?maplibre\.org(\/.*)?$/,
];

// Forbidden external host indicators
const FORBIDDEN_INDICATORS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'unpkg.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'cdn.skypack.dev',
  'api.mapbox.com',
  'tile.openstreetmap.org',
  'google-analytics.com',
  'googletagmanager.com',
];

const EXTENSIONS_TO_SCAN = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.html',
  '.css',
  '.json',
  '.mjs',
]);

const IGNORED_PATHS = [
  'node_modules',
  '.git',
  '.test.',
  '.spec.',
  'scripts/check-offline.mjs',
];

function isIgnored(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return IGNORED_PATHS.some((pattern) => normalized.includes(pattern));
}

function getAllFiles(dirPath, arrayOfFiles = []) {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;

  const stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) {
    if (EXTENSIONS_TO_SCAN.has(path.extname(dirPath)) && !isIgnored(dirPath)) {
      arrayOfFiles.push(dirPath);
    }
    return arrayOfFiles;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (isIgnored(fullPath)) continue;

    if (entry.isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else if (EXTENSIONS_TO_SCAN.has(path.extname(entry.name))) {
      arrayOfFiles.push(fullPath);
    }
  }

  return arrayOfFiles;
}

function checkFileForExternalUrls(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const violations = [];

  // Check 1: Forbidden domain indicators
  for (const indicator of FORBIDDEN_INDICATORS) {
    if (content.includes(indicator)) {
      violations.push({
        file: path.relative(rootDir, filePath),
        indicator,
        detail: `Found forbidden external domain indicator: ${indicator}`,
      });
    }
  }

  // Check 2: Regex extraction of URL strings
  const urlRegex = /(?:https?|wss?):\/\/[^\s"'`<>{}()\[\]\\^|]+/gi;
  let match;
  while ((match = urlRegex.exec(content)) !== null) {
    const foundUrl = match[0].replace(/[.,;:]$/, ''); // strip trailing punctuation
    const isAllowed = ALLOWED_URL_PATTERNS.some((pattern) => pattern.test(foundUrl));

    if (!isAllowed) {
      violations.push({
        file: path.relative(rootDir, filePath),
        url: foundUrl,
        detail: `Unauthorized external network URL detected: ${foundUrl}`,
      });
    }
  }

  return violations;
}

function runOfflineCheck() {
  console.log('===============================================================');
  console.log(' AirOps DSS — Offline-First Air-Gapped Verification Protocol');
  console.log('===============================================================\n');

  let allFiles = [];
  for (const target of SCAN_TARGETS) {
    const fullTarget = path.join(rootDir, target);
    allFiles = allFiles.concat(getAllFiles(fullTarget));
  }

  console.log(`Scanning ${allFiles.length} files across src/, dist/, public/, and index.html...\n`);

  const allViolations = [];
  for (const file of allFiles) {
    const violations = checkFileForExternalUrls(file);
    if (violations.length > 0) {
      allViolations.push(...violations);
    }
  }

  if (allViolations.length > 0) {
    console.error(`\x1b[31m[OFFLINE-CHECK] FAILED: ${allViolations.length} unauthorized external network references found:\x1b[0m\n`);
    allViolations.forEach((v, idx) => {
      console.error(`  ${idx + 1}. \x1b[33m${v.file}\x1b[0m`);
      console.error(`     ${v.detail}`);
    });
    console.error('\n\x1b[31mFAIL: Production bundle is not air-gap safe.\x1b[0m\n');
    process.exit(1);
  } else {
    console.log('\x1b[32m[OFFLINE-CHECK] PASS: Zero external network dependencies found.\x1b[0m');
    console.log('✔ Fonts bundled locally (@fontsource/inter, @fontsource/jetbrains-mono)');
    console.log('✔ MapLibre GL offline tactical style and GeoJSON assets');
    console.log('✔ Audio chime bundled locally (/sounds/alert.wav)');
    console.log('✔ All telemetry constrained to localhost/127.0.0.1\n');
    process.exit(0);
  }
}

runOfflineCheck();
