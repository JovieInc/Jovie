#!/usr/bin/env tsx
/**
 * Test Performance Guard
 *
 * CI script that enforces performance thresholds and fails builds if tests are too slow.
 * Implements YC-style fast feedback by catching performance regressions early.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

interface PerformanceThresholds {
  totalDuration: number; // Maximum total test suite duration (ms)
  p95: number; // Maximum p95 test duration (ms)
  setupTime: number; // Maximum setup time (ms)
  individualTest: number; // Maximum individual test duration (ms)
  slowTestCount: number; // Maximum number of tests exceeding individualTest threshold
}

interface TestMetrics {
  totalDuration: number;
  setupTime: number;
  testExecutionTime: number;
  environmentTime: number;
  slowTests: Array<{ name: string; duration: number }>;
  p95: number;
}

class TestPerformanceGuard {
  private thresholds: PerformanceThresholds = {
    totalDuration: 120000, // 120 seconds (CI environments need more time for cold starts)
    p95: 200, // 200ms
    setupTime: 90000, // 90 seconds (CI cold start can take longer than local)
    individualTest: 200, // 200ms
    slowTestCount: 5, // Max 5 slow tests allowed
  };

  private metrics: TestMetrics = {
    totalDuration: 0,
    setupTime: 0,
    testExecutionTime: 0,
    environmentTime: 0,
    slowTests: [],
    p95: 0,
  };

  async runPerformanceGuard(): Promise<boolean> {
    console.log('🛡️  Running test performance guard...\n');

    try {
      // Load custom thresholds if available
      this.loadCustomThresholds();

      // Run tests and capture metrics
      await this.runTestsAndCaptureMetrics();

      // Check against thresholds
      const violations = this.checkThresholds();

      // Report results
      this.reportResults(violations);

      // Return success/failure
      return violations.length === 0;
    } catch (error) {
      console.error('❌ Performance guard failed:', error);
      return false;
    }
  }

  private async runTestsAndCaptureMetrics(): Promise<void> {
    console.log('⏱️  Running test suite with performance monitoring...');

    try {
      const output = execSync('pnpm test:fast --reporter=verbose', {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 120000,
      });

      this.parseTestOutput(output);
    } catch (error: unknown) {
      // Parse output even if tests fail
      if (
        error &&
        typeof error === 'object' &&
        'stdout' in error &&
        typeof error.stdout === 'string'
      ) {
        this.parseTestOutput(error.stdout);
      } else {
        throw new Error('Failed to run tests or capture output');
      }
    }
  }

  private parseTestOutput(output: string): void {
    // Extract total duration
    const durationMatch = output.match(/Duration\s+(\d+\.?\d*)s/);
    if (durationMatch) {
      this.metrics.totalDuration = parseFloat(durationMatch[1]) * 1000;
    }

    // Extract setup time
    const setupMatch = output.match(/setup\s+(\d+\.?\d*)s/);
    if (setupMatch) {
      this.metrics.setupTime = parseFloat(setupMatch[1]) * 1000;
    }

    // Extract test execution time
    const testsMatch = output.match(/tests\s+(\d+\.?\d*)s/);
    if (testsMatch) {
      this.metrics.testExecutionTime = parseFloat(testsMatch[1]) * 1000;
    }

    // Extract environment time
    const environmentMatch = output.match(/environment\s+(\d+\.?\d*)s/);
    if (environmentMatch) {
      this.metrics.environmentTime = parseFloat(environmentMatch[1]) * 1000;
    }

    // Extract individual test results and calculate p95
    const testResults: number[] = [];
    const seenTests = new Set<string>();
    const addTestResult = (name: string, durationMs: number) => {
      const key = `${name}::${durationMs}`;
      if (seenTests.has(key)) {
        return;
      }
      seenTests.add(key);
      testResults.push(durationMs);

      if (durationMs > this.thresholds.individualTest) {
        this.metrics.slowTests.push({
          name: name.trim(),
          duration: durationMs,
        });
      }
    };

    const simpleTestRegex = /^\s*(?:✓|✅)?\s*(.+?)\s+(\d+)ms\s*$/gm;
    let match;

    while ((match = simpleTestRegex.exec(output)) !== null) {
      const [, name, duration] = match;
      const durationMs = parseInt(duration);
      addTestResult(name.trim(), durationMs);
    }

    // Calculate p95
    if (testResults.length > 0) {
      testResults.sort((a, b) => a - b);
      const p95Index = Math.floor(testResults.length * 0.95);
      this.metrics.p95 = testResults[p95Index] || 0;
    }
  }

  private checkThresholds(): string[] {
    const violations: string[] = [];

    // Check total duration
    if (this.metrics.totalDuration > this.thresholds.totalDuration) {
      violations.push(
        `Total test duration (${this.metrics.totalDuration}ms) exceeds threshold (${this.thresholds.totalDuration}ms)`
      );
    }

    // Check p95
    if (this.metrics.p95 > this.thresholds.p95) {
      violations.push(
        `P95 test duration (${this.metrics.p95}ms) exceeds threshold (${this.thresholds.p95}ms)`
      );
    }

    // Check setup time
    if (this.metrics.setupTime > this.thresholds.setupTime) {
      violations.push(
        `Setup time (${this.metrics.setupTime}ms) exceeds threshold (${this.thresholds.setupTime}ms)`
      );
    }

    // Check slow test count
    if (this.metrics.slowTests.length > this.thresholds.slowTestCount) {
      violations.push(
        `Number of slow tests (${this.metrics.slowTests.length}) exceeds threshold (${this.thresholds.slowTestCount})`
      );
    }

    return violations;
  }

  private reportResults(violations: string[]): void {
    console.log('\n📊 PERFORMANCE GUARD REPORT');
    console.log('============================\n');

    // Current metrics
    console.log('📈 CURRENT METRICS:');
    console.log(
      `   Total Duration: ${this.metrics.totalDuration}ms (threshold: ${this.thresholds.totalDuration}ms)`
    );
    console.log(
      `   Setup Time: ${this.metrics.setupTime}ms (threshold: ${this.thresholds.setupTime}ms)`
    );
    console.log(
      `   P95: ${this.metrics.p95}ms (threshold: ${this.thresholds.p95}ms)`
    );
    console.log(
      `   Slow Tests: ${this.metrics.slowTests.length} (threshold: ${this.thresholds.slowTestCount})`
    );
    console.log('');

    // Violations
    if (violations.length > 0) {
      console.log('🚨 PERFORMANCE VIOLATIONS:');
      violations.forEach((violation, index) => {
        console.log(`   ${index + 1}. ${violation}`);
      });
      console.log('');

      // Show slow tests if any
      if (this.metrics.slowTests.length > 0) {
        console.log('🐌 SLOW TESTS:');
        this.metrics.slowTests
          .sort((a, b) => b.duration - a.duration)
          .slice(0, 10)
          .forEach((test, index) => {
            console.log(`   ${index + 1}. ${test.name}: ${test.duration}ms`);
          });
        console.log('');
      }

      console.log('❌ Performance guard FAILED - build should be rejected');
      console.log(
        '💡 Run `pnpm tsx scripts/test-performance-profiler.ts` for detailed analysis'
      );
    } else {
      console.log('✅ All performance thresholds met!');
      console.log('🚀 Performance guard PASSED');
    }
  }

  // Load custom thresholds from config file if it exists
  private loadCustomThresholds(): void {
    const configPath = join(process.cwd(), 'test-performance-config.json');
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, 'utf8'));
        this.thresholds = { ...this.thresholds, ...config.thresholds };
        console.log('📋 Loaded custom performance thresholds');
      } catch {
        console.warn('⚠️  Failed to load custom thresholds, using defaults');
      }
    }
  }
}

// Run the guard if called directly
if (require.main === module) {
  const guard = new TestPerformanceGuard();
  guard
    .runPerformanceGuard()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(() => {
      console.error('💥 Performance guard crashed');
      process.exit(1);
    });
}

export { TestPerformanceGuard };
