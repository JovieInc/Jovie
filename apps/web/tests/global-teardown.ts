/**
 * Global Teardown for E2E Tests
 *
 * Cleanup after all tests complete:
 * - Log test completion status
 * - Clean up browser resources
 * - Report final metrics
 */

async function globalTeardown() {
  // When running against an external BASE_URL in CI (e.g., Preview), skip local cleanup
  if (process.env.CI && process.env.BASE_URL) {
    console.log('\n Skipping teardown for external BASE_URL deployment tests');
    return;
  }

  console.log('\n E2E Test Teardown');

  const startTime = process.env.E2E_START_TIME;
  const endTime = new Date().toISOString();

  if (startTime) {
    const duration = Date.now() - new Date(startTime).getTime();
    console.log(` Total test run duration: ${Math.round(duration / 1000)}s`);
  }

  console.log(` Completed at: ${endTime}`);
  console.log(` Environment: ${process.env.NODE_ENV || 'test'}`);

  // Log cleanup summary
  console.log(' E2E test teardown complete');
}

export default globalTeardown;
