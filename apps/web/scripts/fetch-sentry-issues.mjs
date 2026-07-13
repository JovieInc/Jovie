#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const SENTRY_ORG = 'jovie';
const SENTRY_API = 'https://sentry.io/api/0';

// Read auth token from .env.sentry-build-plugin
const envPath = join(process.cwd(), '.env.sentry-build-plugin');
const envContent = readFileSync(envPath, 'utf-8');
const tokenMatch = envContent.match(/SENTRY_AUTH_TOKEN=(.+)/);
if (!tokenMatch) {
  console.error('❌ SENTRY_AUTH_TOKEN not found in .env.sentry-build-plugin');
  process.exit(1);
}
const SENTRY_TOKEN = tokenMatch[1].trim();

async function fetchSentryAPI(endpoint) {
  const url = `${SENTRY_API}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${SENTRY_TOKEN}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Sentry API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

async function discoverProjects() {
  console.log('🔍 Discovering Sentry projects...');
  const projects = await fetchSentryAPI(
    `/organizations/${SENTRY_ORG}/projects/`
  );
  console.log(`   Found ${projects.length} projects:`);
  projects.forEach(p => console.log(`   - ${p.slug} (${p.platform})`));
  return projects;
}

async function fetchIssuesForProject(projectSlug) {
  console.log(`\n📥 Fetching issues for project: ${projectSlug}`);

  // Fetch unresolved critical/error issues from last 24h
  const query = encodeURIComponent(
    'is:unresolved (level:error OR level:fatal)'
  );
  const endpoint = `/organizations/${SENTRY_ORG}/issues/?query=${query}&statsPeriod=24h&sort=freq&limit=100&project=${projectSlug}`;

  try {
    const issues = await fetchSentryAPI(endpoint);
    console.log(`   Found ${issues.length} issues`);
    return issues;
  } catch (error) {
    console.error(
      `   ⚠️  Error fetching issues for ${projectSlug}:`,
      error.message
    );
    return [];
  }
}

async function parseIssue(issue) {
  const parsed = {
    id: issue.id,
    shortId: issue.shortId,
    title: issue.title,
    culprit: issue.culprit,
    permalink: issue.permalink,
    level: issue.level,
    status: issue.status,
    eventCount: issue.count,
    userCount: issue.userCount,
    firstSeen: issue.firstSeen,
    lastSeen: issue.lastSeen,
    type: issue.type,
    metadata: issue.metadata,
    project: issue.project?.slug,
  };

  // Try to extract stack trace from metadata
  if (issue.metadata?.value) {
    parsed.errorMessage = issue.metadata.value;
  }
  if (issue.metadata?.type) {
    parsed.errorType = issue.metadata.type;
  }

  return parsed;
}

async function main() {
  console.log('🚀 Starting Sentry issue collection\n');
  console.log('='.repeat(60));

  try {
    // Discover all projects
    const projects = await discoverProjects();

    // Fetch issues from all projects
    const allIssues = [];
    for (const project of projects) {
      const issues = await fetchIssuesForProject(project.slug);
      const parsedIssues = await Promise.all(issues.map(parseIssue));
      allIssues.push(...parsedIssues);
    }

    console.log('\n' + '='.repeat(60));
    console.log(`\n✅ Total issues found: ${allIssues.length}\n`);

    // Group by error type
    const byType = allIssues.reduce((acc, issue) => {
      const type = issue.errorType || issue.type || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    console.log('📊 Issues by type:');
    Object.entries(byType)
      .sort(([, a], [, b]) => b - a)
      .forEach(([type, count]) => {
        console.log(`   ${type}: ${count}`);
      });

    // Sort by event count (impact)
    allIssues.sort((a, b) => b.eventCount - a.eventCount);

    // Save to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = join(
      process.cwd(),
      'apps/web/.issues',
      `sentry-issues-${timestamp}.json`
    );
    writeFileSync(outputPath, JSON.stringify(allIssues, null, 2));
    console.log(`\n💾 Saved to: ${outputPath}`);

    // Also save to a "latest" file for easy access
    const latestPath = join(
      process.cwd(),
      'apps/web/.issues',
      'sentry-issues-latest.json'
    );
    writeFileSync(latestPath, JSON.stringify(allIssues, null, 2));
    console.log(`💾 Latest: ${latestPath}`);

    // Print top 10 issues
    console.log('\n🔥 Top 10 issues by event count:');
    allIssues.slice(0, 10).forEach((issue, idx) => {
      console.log(`\n${idx + 1}. ${issue.title}`);
      console.log(`   ID: ${issue.shortId}`);
      console.log(`   Events: ${issue.eventCount} | Users: ${issue.userCount}`);
      console.log(`   Level: ${issue.level}`);
      console.log(`   Culprit: ${issue.culprit || 'N/A'}`);
      console.log(`   URL: ${issue.permalink}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
