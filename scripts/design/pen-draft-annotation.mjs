/** Keep local output and the CI annotation consistent for blocked runs. */
export function reportBlockedRun(reason) {
  const message = `pen-draft: blocked, ${reason}`;
  console.log(message);
  if (process.env.GITHUB_ACTIONS === 'true')
    console.log(`::error title=pen-draft blocked::${message}`);
}
