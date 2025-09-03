#!/usr/bin/env tsx
/**
 * Test Performance Profiler
 * 
 * Analyzes test suite performance to identify bottlenecks and optimization opportunities.
 * Generates detailed reports on setup time, individual test performance, and overall metrics.
 */

import { execSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

interface TestResult {
  name: string;
  duration: number;
  tests: number;
  status: 'passed' | 'failed' | 'skipped';
}

interface PerformanceMetrics {
  totalDuration: number;
  setupTime: number;
  testExecutionTime: number;
  environmentTime: number;
  transformTime: number;
  collectTime: number;
  prepareTime: number;
  testResults: TestResult[];
  slowTests: TestResult[];
  performanceStats: {
    p50: number;
    p95: number;
    p99: number;
    average: number;
    median: number;
  };
}

class TestPerformanceProfiler {
  private results: PerformanceMetrics = {
    totalDuration: 0,
    setupTime: 0,
    testExecutionTime: 0,
    environmentTime: 0,
    transformTime: 0,
    collectTime: 0,
    prepareTime: 0,
    testResults: [],
    slowTests: [],
    performanceStats: {
      p50: 0,
      p95: 0,
      p99: 0,
      average: 0,
      median: 0,
    },
  };

  async runPerformanceAnalysis(): Promise<PerformanceMetrics> {
    console.log('🔍 Starting test performance analysis...\n');

    // Run tests with verbose output and capture timing data
    const testOutput = this.runTestsWithTiming();
    
    // Parse the output to extract performance metrics
    this.parseTestOutput(testOutput);
    
    // Calculate performance statistics
    this.calculatePerformanceStats();
    
    // Identify slow tests (>200ms)
    this.identifySlowTests();
    
    // Generate performance report
    this.generateReport();
    
    // Save baseline data
    this.saveBaseline();
    
    return this.results;
  }

  private runTestsWithTiming(): string {
    console.log('⏱️  Running test suite with timing analysis...');
    
    try {
      const output = execSync('pnpm test --reporter=verbose', {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 120000, // 2 minutes timeout
      });
      
      return output;
    } catch (error: any) {
      // Tests might fail but we still want the timing data
      return error.stdout || error.output?.join('') || '';
    }
  }

  private parseTestOutput(output: string): void {
    const lines = output.split('\n');
    
    // Extract overall timing information
    const durationMatch = output.match(/Duration\s+(\d+\.?\d*)s/);
    if (durationMatch) {
      this.results.totalDuration = parseFloat(durationMatch[1]) * 1000; // Convert to ms
    }

    const setupMatch = output.match(/setup\s+(\d+\.?\d*)s/);
    if (setupMatch) {
      this.results.setupTime = parseFloat(setupMatch[1]) * 1000;
    }

    const testsMatch = output.match(/tests\s+(\d+\.?\d*)s/);
    if (testsMatch) {
      this.results.testExecutionTime = parseFloat(testsMatch[1]) * 1000;
    }

    const environmentMatch = output.match(/environment\s+(\d+\.?\d*)s/);
    if (environmentMatch) {
      this.results.environmentTime = parseFloat(environmentMatch[1]) * 1000;
    }

    const transformMatch = output.match(/transform\s+(\d+\.?\d*)s/);
    if (transformMatch) {
      this.results.transformTime = parseFloat(transformMatch[1]) * 1000;
    }

    const collectMatch = output.match(/collect\s+(\d+\.?\d*)s/);
    if (collectMatch) {
      this.results.collectTime = parseFloat(collectMatch[1]) * 1000;
    }

    const prepareMatch = output.match(/prepare\s+(\d+\.?\d*)s/);
    if (prepareMatch) {
      this.results.prepareTime = parseFloat(prepareMatch[1]) * 1000;
    }

    // Extract individual test results
    const testResultRegex = /✓\s+(.+?)\s+\((\d+)\s+tests?\)\s+(\d+)ms/g;
    let match;
    
    while ((match = testResultRegex.exec(output)) !== null) {
      const [, name, testCount, duration] = match;
      this.results.testResults.push({
        name: name.trim(),
        duration: parseInt(duration),
        tests: parseInt(testCount),
        status: 'passed',
      });
    }

    // Also capture individual test timings within files
    const individualTestRegex = /✓\s+(.+?)\s+(\d+)ms$/gm;
    while ((match = individualTestRegex.exec(output)) !== null) {
      const [, name, duration] = match;
      if (!name.includes('(') && !name.includes('tests')) {
        this.results.testResults.push({
          name: name.trim(),
          duration: parseInt(duration),
          tests: 1,
          status: 'passed',
        });
      }
    }
  }

  private calculatePerformanceStats(): void {
    const durations = this.results.testResults.map(t => t.duration).sort((a, b) => a - b);
    
    if (durations.length === 0) return;

    this.results.performanceStats.average = durations.reduce((a, b) => a + b, 0) / durations.length;
    this.results.performanceStats.median = durations[Math.floor(durations.length / 2)];
    this.results.performanceStats.p50 = durations[Math.floor(durations.length * 0.5)];
    this.results.performanceStats.p95 = durations[Math.floor(durations.length * 0.95)];
    this.results.performanceStats.p99 = durations[Math.floor(durations.length * 0.99)];
  }

  private identifySlowTests(): void {
    this.results.slowTests = this.results.testResults
      .filter(test => test.duration > 200)
      .sort((a, b) => b.duration - a.duration);
  }

  private generateReport(): void {
    console.log('\n📊 TEST PERFORMANCE ANALYSIS REPORT');
    console.log('=====================================\n');

    // Overall metrics
    console.log('🎯 OVERALL METRICS:');
    console.log(`   Total Duration: ${this.results.totalDuration.toFixed(0)}ms`);
    console.log(`   Setup Time: ${this.results.setupTime.toFixed(0)}ms (${((this.results.setupTime / this.results.totalDuration) * 100).toFixed(1)}%)`);
    console.log(`   Test Execution: ${this.results.testExecutionTime.toFixed(0)}ms (${((this.results.testExecutionTime / this.results.totalDuration) * 100).toFixed(1)}%)`);
    console.log(`   Environment: ${this.results.environmentTime.toFixed(0)}ms (${((this.results.environmentTime / this.results.totalDuration) * 100).toFixed(1)}%)`);
    console.log(`   Transform: ${this.results.transformTime.toFixed(0)}ms`);
    console.log(`   Collect: ${this.results.collectTime.toFixed(0)}ms`);
    console.log(`   Prepare: ${this.results.prepareTime.toFixed(0)}ms\n`);

    // Performance statistics
    console.log('📈 PERFORMANCE STATISTICS:');
    console.log(`   Average: ${this.results.performanceStats.average.toFixed(1)}ms`);
    console.log(`   Median (P50): ${this.results.performanceStats.p50}ms`);
    console.log(`   P95: ${this.results.performanceStats.p95}ms ${this.results.performanceStats.p95 > 200 ? '🚨 EXCEEDS TARGET' : '✅'}`);
    console.log(`   P99: ${this.results.performanceStats.p99}ms\n`);

    // Slow tests analysis
    console.log(`🐌 SLOW TESTS (>${200}ms): ${this.results.slowTests.length} tests`);
    if (this.results.slowTests.length > 0) {
      console.log('   Top 10 slowest tests:');
      this.results.slowTests.slice(0, 10).forEach((test, index) => {
        const avgPerTest = test.tests > 1 ? ` (${(test.duration / test.tests).toFixed(0)}ms/test)` : '';
        console.log(`   ${index + 1}. ${test.name}: ${test.duration}ms${avgPerTest}`);
      });
    }
    console.log('');

    // Recommendations
    this.generateRecommendations();
  }

  private generateRecommendations(): void {
    console.log('💡 OPTIMIZATION RECOMMENDATIONS:');
    
    const setupPercentage = (this.results.setupTime / this.results.totalDuration) * 100;
    if (setupPercentage > 50) {
      console.log(`   🚨 HIGH PRIORITY: Setup time is ${setupPercentage.toFixed(1)}% of total time`);
      console.log('      → Implement lazy loading for mocks');
      console.log('      → Reduce upfront initialization in tests/setup.ts');
      console.log('      → Consider selective mock loading based on test files');
    }

    if (this.results.performanceStats.p95 > 200) {
      console.log(`   🚨 P95 (${this.results.performanceStats.p95}ms) exceeds 200ms target`);
      console.log('      → Optimize slow individual tests');
      console.log('      → Use shallow rendering for component tests');
      console.log('      → Replace full mocks with test doubles');
    }

    if (this.results.slowTests.length > 10) {
      console.log(`   ⚠️  ${this.results.slowTests.length} tests exceed 200ms`);
      console.log('      → Focus on top 10 slowest tests first');
      console.log('      → Consider test sharding for complex tests');
    }

    const environmentPercentage = (this.results.environmentTime / this.results.totalDuration) * 100;
    if (environmentPercentage > 30) {
      console.log(`   ⚠️  Environment setup is ${environmentPercentage.toFixed(1)}% of total time`);
      console.log('      → Optimize jsdom configuration');
      console.log('      → Consider lighter test environment');
    }

    console.log('');
  }

  private saveBaseline(): void {
    const baseline = {
      timestamp: new Date().toISOString(),
      metrics: this.results,
      targets: {
        totalDuration: 60000, // 60s
        p95: 200, // 200ms
        setupTime: 10000, // 10s
      },
    };

    writeFileSync(
      join(process.cwd(), 'test-performance-baseline.json'),
      JSON.stringify(baseline, null, 2)
    );

    console.log('💾 Performance baseline saved to test-performance-baseline.json');
  }
}

// Run the profiler if called directly
if (require.main === module) {
  const profiler = new TestPerformanceProfiler();
  profiler.runPerformanceAnalysis().catch(console.error);
}

export { TestPerformanceProfiler, type PerformanceMetrics };

