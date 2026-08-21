export const SONAR_CHECK_APP_SLUG = 'sonarqubecloud';
export const SONAR_CHECK_NAME = 'SonarCloud Code Analysis';

function observedAt(check) {
  return String(check?.completed_at ?? check?.started_at ?? '');
}

export function selectLatestFailingSonarCheck(pages) {
  const checks = (Array.isArray(pages) ? pages : [])
    .flatMap(page => (Array.isArray(page?.check_runs) ? page.check_runs : []))
    .filter(
      check =>
        check?.name === SONAR_CHECK_NAME &&
        check?.app?.slug === SONAR_CHECK_APP_SLUG &&
        /^https:\/\/sonarcloud\.io\//.test(String(check?.details_url ?? ''))
    )
    .sort((a, b) => observedAt(a).localeCompare(observedAt(b)));
  const latest = checks.at(-1);
  return latest?.status === 'completed' && latest?.conclusion === 'failure'
    ? latest
    : null;
}
