/**
 * Global Teardown for Synthetic Monitoring
 *
 * Cleanup after synthetic tests:
 * - Log final results
 * - Clean up test data if needed
 * - Report metrics
 */

async function globalTeardown() {
  console.log('\n🧹 Synthetic Monitoring Teardown');

  const runId = process.env.SYNTHETIC_RUN_ID;
  const startTime = process.env.SYNTHETIC_START_TIME;
  const endTime = new Date().toISOString();

  if (startTime) {
    const duration = Date.now() - new Date(startTime).getTime();
    console.log(`⏱️ Total run duration: ${duration}ms`);
  }

  console.log(`📊 Run ID: ${runId}`);
  console.log(`🏁 Completed at: ${endTime}`);
  console.log(`🌍 Environment: ${process.env.E2E_ENVIRONMENT}`);

  // Log final metrics for monitoring dashboards
  const metrics = {
    run_id: runId,
    environment: process.env.E2E_ENVIRONMENT,
    start_time: startTime,
    end_time: endTime,
    duration_ms: startTime ? Date.now() - new Date(startTime).getTime() : null,
    base_url: process.env.BASE_URL,
    user_agent: 'Jovie-SyntheticMonitoring/1.0',
  };

  console.log('📈 Final metrics:', JSON.stringify(metrics, null, 2));

  // In a real implementation, you might want to:
  // 1. Clean up any test users created during synthetic runs
  // 2. Send metrics to your monitoring system
  // 3. Update health status in your status page

  console.log('✅ Synthetic monitoring teardown complete');
}

export default globalTeardown;
