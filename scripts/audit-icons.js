#!/usr/bin/env node

/**
 * Icon Usage Audit Script
 *
 * This script audits the codebase for icon usage patterns and identifies:
 * 1. Direct SVG imports that should use Heroicons
 * 2. Inline SVG usage that could be replaced with standard icons
 * 3. Direct SimpleIcons usage that should use SocialIcon component
 * 4. Custom SVG usage that may need approval
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

// Configuration
const APPROVED_CUSTOM_SVGS = [
  '/brand/jovie-logo.svg',
  '/brand/Jovie-Logo-Icon.svg',
];

const ALLOWED_DIRECT_SVG_FILES = [
  'components/atoms/SocialIcon.tsx', // Uses SimpleIcons directly
  'components/atoms/IconBadge.tsx', // Renders SVG children
  'components/atoms/Icon.tsx', // New unified icon component
  'tests/unit/', // Test files with mock SVGs
  'tests/', // All test files
  '__tests__/', // Test files
  '.test.', // Test files
  '.spec.', // Test files
  'stories', // Storybook files
  '.stories.', // Storybook files
];

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function findFiles(dir, extensions = ['.tsx', '.ts', '.jsx', '.js']) {
  const files = [];

  function traverse(currentDir) {
    const items = fs.readdirSync(currentDir);

    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // Skip node_modules, .next, etc.
        if (
          !item.startsWith('.') &&
          item !== 'node_modules' &&
          item !== 'out' &&
          item !== 'build'
        ) {
          traverse(fullPath);
        }
      } else if (extensions.some(ext => item.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  }

  traverse(dir);
  return files;
}

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(process.cwd(), filePath);
  const issues = [];

  // Check for direct SVG imports
  const svgImportRegex = /import\s+.*?from\s+['"].*?\.svg['"];?/g;
  const svgImports = content.match(svgImportRegex) || [];

  for (const importStatement of svgImports) {
    const pathMatch = importStatement.match(/['"]([^'"]*\.svg)['"]/);
    if (pathMatch) {
      const svgPath = pathMatch[1];
      if (!APPROVED_CUSTOM_SVGS.some(approved => svgPath.includes(approved))) {
        issues.push({
          type: 'direct-svg-import',
          line: getLineNumber(content, importStatement),
          message: `Direct SVG import: ${importStatement.trim()}`,
          suggestion:
            'Use Heroicons for UI icons or SocialIcon for social/brand icons',
        });
      }
    }
  }

  // Check for inline SVG elements
  const inlineSvgRegex = /<svg[\s\S]*?<\/svg>/g;
  const inlineSvgs = content.match(inlineSvgRegex) || [];

  if (
    inlineSvgs.length > 0 &&
    !ALLOWED_DIRECT_SVG_FILES.some(allowed => relativePath.includes(allowed))
  ) {
    for (const svg of inlineSvgs) {
      issues.push({
        type: 'inline-svg',
        line: getLineNumber(content, svg),
        message: `Inline SVG found (${svg.substring(0, 50)}...)`,
        suggestion:
          'Use Heroicons for UI icons or SocialIcon for social/brand icons',
      });
    }
  }

  // Check for direct SimpleIcons imports
  const simpleIconsRegex = /import\s+.*?from\s+['"]simple-icons['"];?/g;
  const simpleIconsImports = content.match(simpleIconsRegex) || [];

  if (
    simpleIconsImports.length > 0 &&
    !relativePath.includes('SocialIcon.tsx')
  ) {
    for (const importStatement of simpleIconsImports) {
      issues.push({
        type: 'direct-simple-icons',
        line: getLineNumber(content, importStatement),
        message: `Direct SimpleIcons import: ${importStatement.trim()}`,
        suggestion: 'Use SocialIcon component instead',
      });
    }
  }

  // Check for img tags with SVG sources
  const imgSvgRegex = /<img[^>]*src=['"][^'"]*\.svg['"][^>]*>/g;
  const imgSvgs = content.match(imgSvgRegex) || [];

  for (const img of imgSvgs) {
    const srcMatch = img.match(/src=['"]([^'"]*\.svg)['"]/);
    if (srcMatch) {
      const svgPath = srcMatch[1];
      if (!APPROVED_CUSTOM_SVGS.some(approved => svgPath.includes(approved))) {
        issues.push({
          type: 'img-svg',
          line: getLineNumber(content, img),
          message: `IMG with SVG source: ${img.trim()}`,
          suggestion:
            'Verify if this is an approved custom SVG or should use standard icons',
        });
      }
    }
  }

  return { filePath: relativePath, issues };
}

function getLineNumber(content, searchString) {
  const lines = content.substring(0, content.indexOf(searchString)).split('\n');
  return lines.length;
}

function generateReport(results) {
  const totalFiles = results.length;
  const filesWithIssues = results.filter(r => r.issues.length > 0);
  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);

  log('bold', '\n📊 ICON USAGE AUDIT REPORT');
  log('cyan', '='.repeat(50));

  log('blue', `📁 Total files scanned: ${totalFiles}`);
  log('yellow', `⚠️  Files with issues: ${filesWithIssues.length}`);
  log('red', `🚨 Total issues found: ${totalIssues}`);

  if (totalIssues === 0) {
    log(
      'green',
      '\n✅ No icon usage issues found! Your codebase follows the standards.'
    );
    return;
  }

  // Group issues by type
  const issuesByType = {};
  results.forEach(result => {
    result.issues.forEach(issue => {
      if (!issuesByType[issue.type]) {
        issuesByType[issue.type] = [];
      }
      issuesByType[issue.type].push({ ...issue, file: result.filePath });
    });
  });

  log('cyan', '\n📋 ISSUES BY TYPE:');

  Object.entries(issuesByType).forEach(([type, issues]) => {
    const typeNames = {
      'direct-svg-import': '📥 Direct SVG Imports',
      'inline-svg': '🔧 Inline SVG Usage',
      'direct-simple-icons': '📦 Direct SimpleIcons Imports',
      'img-svg': '🖼️  IMG with SVG Source',
    };

    log('yellow', `\n${typeNames[type] || type} (${issues.length} issues):`);

    issues.forEach(issue => {
      log('red', `  ❌ ${issue.file}:${issue.line}`);
      log('reset', `     ${issue.message}`);
      log('green', `     💡 ${issue.suggestion}`);
    });
  });

  log('cyan', '\n🔧 RECOMMENDED ACTIONS:');
  log('reset', '1. Replace direct SVG imports with Heroicons for UI icons');
  log('reset', '2. Use SocialIcon component for social media and brand icons');
  log(
    'reset',
    '3. Replace inline SVGs with standard library icons when possible'
  );
  log('reset', '4. Request approval for any necessary custom SVGs');
  log(
    'reset',
    '5. Run ESLint with the new icon-usage rule to catch future violations'
  );

  log('cyan', '\n📚 RESOURCES:');
  log('reset', '• Icon Standards: docs/ICON_STANDARDS.md');
  log('reset', '• Heroicons: https://heroicons.com');
  log('reset', '• SimpleIcons: https://simpleicons.org');
  log('reset', '• SocialIcon component: components/atoms/SocialIcon.tsx');
}

function main() {
  log('bold', '🔍 Starting icon usage audit...\n');

  const projectRoot = process.cwd();
  const files = findFiles(projectRoot);

  log('blue', `Found ${files.length} files to analyze`);

  const results = files.map(analyzeFile);

  generateReport(results);

  // Exit with error code if issues found
  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
  if (totalIssues > 0) {
    log(
      'red',
      '\n❌ Audit completed with issues. Please address the violations above.'
    );
    process.exit(1);
  } else {
    log('green', '\n✅ Audit completed successfully. No issues found!');
    process.exit(0);
  }
}

// Run the audit
if (require.main === module) {
  main();
}

module.exports = { analyzeFile, generateReport };
