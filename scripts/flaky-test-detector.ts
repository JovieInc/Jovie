#!/usr/bin/env tsx
/**
 * Flaky Test Detector
 *
 * Runs tests multiple times to identify inconsistent/unstable tests.
 * Quarantines flaky tests to prevent them from blocking CI.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

interface TestRun {
  testName: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
}

interface FlakyTestResult {
  testName: string;
  totalRuns: number;
  passCount: number;
  failCount: number;
  skipCount: number;
  flakyScore: number; // 0-1, higher = more flaky
  averageDuration: number;
  errors: string[];
}

class FlakyTestDetector {
  private runs: TestRun[][] = [];
  private flakyTests: FlakyTestResult[] = [];
  private readonly FLAKY_THRESHOLD = 0.1; // 10% failure rate = flaky
  private readonly MIN_RUNS = 5;

  async detectFlakyTests(
    testPattern?: string,
    runCount = 10
  ): Promise<FlakyTestResult[]> {
    console.log(`🔍 Running flaky test detection (${runCount} runs)...\n`);

    // Run tests multiple times
    for (let i = 1; i <= runCount; i++) {
      console.log(`📊 Run ${i}/${runCount}...`);
      const runResults = await this.runSingleTestRun(testPattern);
      this.runs.push(runResults);
    }

    // Analyze results
    this.analyzeTestStability();

    // Generate report
    this.generateFlakyReport();

    // Quarantine flaky tests
    await this.quarantineFlakyTests();

    return this.flakyTests;
  }

  private async runSingleTestRun(testPattern?: string): Promise<TestRun[]> {
    const results: TestRun[] = [];

    try {
      const command = testPattern
        ? `pnpm test ${testPattern} --reporter=verbose`
        : 'pnpm test --reporter=verbose';

      const output = execSync(command, {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 120000,
      });

      // Parse test results
      this.parseTestResults(output, results);
    } catch (error: unknown) {
      // Tests might fail, but we still want to parse the output
      if (error && typeof error === 'object' && 'stdout' in error) {
        this.parseTestResults((error as { stdout: string }).stdout, results);
      }

      // Also capture any failed tests from stderr
      if (error && typeof error === 'object' && 'stderr' in error) {
        this.parseFailedTests((error as { stderr: string }).stderr, results);
      }
    }

    return results;
  }

  private parseTestResults(output: string, results: TestRun[]): void {
    // Parse successful tests
    const successRegex = /✓\s+(.+?)\s+(\d+)ms/g;
    let match;

    while ((match = successRegex.exec(output)) !== null) {
      const [, testName, duration] = match;
      results.push({
        testName: testName.trim(),
        status: 'passed',
        duration: parseInt(duration),
      });
    }

    // Parse failed tests
    const failRegex = /✗\s+(.+?)\s+(\d+)ms/g;
    while ((match = failRegex.exec(output)) !== null) {
      const [, testName, duration] = match;
      results.push({
        testName: testName.trim(),
        status: 'failed',
        duration: parseInt(duration),
      });
    }

    // Parse skipped tests
    const skipRegex = /⏭\s+(.+)/g;
    while ((match = skipRegex.exec(output)) !== null) {
      const [, testName] = match;
      results.push({
        testName: testName.trim(),
        status: 'skipped',
        duration: 0,
      });
    }
  }

  private parseFailedTests(stderr: string, results: TestRun[]): void {
    // Extract error information for failed tests
    const lines = stderr.split('\n');
    let currentTest = '';
    let errorLines: string[] = [];

    for (const line of lines) {
      if (line.includes('FAIL') || line.includes('Error:')) {
        if (currentTest && errorLines.length > 0) {
          // Find the test in results and add error info
          const testResult = results.find(r => r.testName === currentTest);
          if (testResult) {
            testResult.error = errorLines.join('\n');
          }
        }
        currentTest = line.trim();
        errorLines = [];
      } else if (currentTest && line.trim()) {
        errorLines.push(line.trim());
      }
    }

    // Handle the last test if there are remaining error lines
    if (currentTest && errorLines.length > 0) {
      const testResult = results.find(r => r.testName === currentTest);
      if (testResult) {
        testResult.error = errorLines.join('\n');
      }
    }
  }

  private analyzeTestStability(): void {
    // Group results by test name
    const testGroups = new Map<string, TestRun[]>();

    for (const run of this.runs) {
      for (const test of run) {
        if (!testGroups.has(test.testName)) {
          testGroups.set(test.testName, []);
        }
        testGroups.get(test.testName)!.push(test);
      }
    }

    // Analyze each test for flakiness
    for (const [testName, testRuns] of testGroups) {
      if (testRuns.length < this.MIN_RUNS) continue;

      const passCount = testRuns.filter(r => r.status === 'passed').length;
      const failCount = testRuns.filter(r => r.status === 'failed').length;
      const skipCount = testRuns.filter(r => r.status === 'skipped').length;

      // Calculate flaky score (higher = more inconsistent)
      const totalRuns = testRuns.length;
      const flakyScore = failCount / totalRuns;

      // Calculate average duration
      const durations = testRuns
        .filter(r => r.duration > 0)
        .map(r => r.duration);
      const averageDuration =
        durations.length > 0
          ? durations.reduce((a, b) => a + b, 0) / durations.length
          : 0;

      // Collect unique errors
      const errors = [
        ...new Set(testRuns.filter(r => r.error).map(r => r.error!)),
      ];

      const result: FlakyTestResult = {
        testName,
        totalRuns,
        passCount,
        failCount,
        skipCount,
        flakyScore,
        averageDuration,
        errors,
      };

      // Consider test flaky if it has inconsistent results
      if (
        flakyScore > 0 &&
        flakyScore < 1 &&
        flakyScore >= this.FLAKY_THRESHOLD
      ) {
        this.flakyTests.push(result);
      }
    }

    // Sort by flaky score (most flaky first)
    this.flakyTests.sort((a, b) => b.flakyScore - a.flakyScore);
  }

  private generateFlakyReport(): void {
    console.log('\n🎯 FLAKY TEST DETECTION REPORT');
    console.log('===============================\n');

    console.log(`📊 SUMMARY:`);
    console.log(`   Total test runs: ${this.runs.length}`);
    console.log(`   Flaky tests detected: ${this.flakyTests.length}`);
    console.log(
      `   Flaky threshold: ${(this.FLAKY_THRESHOLD * 100).toFixed(1)}%\n`
    );

    if (this.flakyTests.length === 0) {
      console.log('✅ No flaky tests detected! All tests are stable.\n');
      return;
    }

    console.log('🚨 FLAKY TESTS DETECTED:');
    this.flakyTests.forEach((test, index) => {
      const flakyPercent = (test.flakyScore * 100).toFixed(1);
      console.log(`\n${index + 1}. ${test.testName}`);
      console.log(
        `   Flaky Score: ${flakyPercent}% (${test.failCount}/${test.totalRuns} failures)`
      );
      console.log(`   Average Duration: ${test.averageDuration.toFixed(0)}ms`);

      if (test.errors.length > 0) {
        console.log(`   Common Errors:`);
        test.errors.slice(0, 2).forEach(error => {
          const shortError =
            error.length > 100 ? error.substring(0, 100) + '...' : error;
          console.log(`     - ${shortError}`);
        });
      }
    });

    console.log('\n💡 RECOMMENDATIONS:');
    console.log(
      '   1. Review flaky tests for timing issues or race conditions'
    );
    console.log('   2. Add proper waits/assertions for async operations');
    console.log(
      '   3. Consider quarantining highly flaky tests (>50% failure rate)'
    );
    console.log('   4. Check for shared state or resource conflicts\n');
  }

  private async quarantineFlakyTests(): Promise<void> {
    if (this.flakyTests.length === 0) return;

    // Create quarantine directory
    const quarantineDir = join(process.cwd(), 'tests/quarantine');
    if (!existsSync(quarantineDir)) {
      mkdirSync(quarantineDir, { recursive: true });
    }

    // Create quarantine list
    const quarantineList = {
      timestamp: new Date().toISOString(),
      flakyTests: this.flakyTests.map(test => ({
        testName: test.testName,
        flakyScore: test.flakyScore,
        reason: `Flaky test with ${(test.flakyScore * 100).toFixed(1)}% failure rate`,
      })),
    };

    writeFileSync(
      join(quarantineDir, 'flaky-tests.json'),
      JSON.stringify(quarantineList, null, 2)
    );

    // Create quarantine test configuration
    const quarantineConfig = {
      testMatch: this.flakyTests.map(
        test => `**/*${test.testName.replace(/\s+/g, '*')}*`
      ),
      retries: 3,
      timeout: 10000,
    };

    writeFileSync(
      join(quarantineDir, 'quarantine.config.json'),
      JSON.stringify(quarantineConfig, null, 2)
    );

    console.log(`🏥 Quarantined ${this.flakyTests.length} flaky tests`);
    console.log(`   Quarantine list: tests/quarantine/flaky-tests.json`);
    console.log(
      `   Quarantine config: tests/quarantine/quarantine.config.json\n`
    );
  }
}

// Run the detector if called directly
if (require.main === module) {
  const detector = new FlakyTestDetector();
  const testPattern = process.argv[2];
  const runCount = parseInt(process.argv[3]) || 10;

  detector.detectFlakyTests(testPattern, runCount).catch(console.error);
}

export { FlakyTestDetector, type FlakyTestResult };
