// Throwaway fixture for the JOV-12720 verify-by-exercise. Deleted at the end
// of the exercise; makes no API calls (the octokit line below is guard-detection
// data, not a call).
// api-budget: github-actions-token 0/hr - exercise fixture; no API calls.
export function exercisePollFixture(octokit) {
  while (true) {
    const pr = await octokit.rest.pulls.get({ pull_number: 1 });
    if (pr) return pr;
  }
}
