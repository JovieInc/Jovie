/** Clock delivery never authorizes post-mortem/growth learning work. */
export function assertEventDrivenLearning(
  eventName = process.env.GITHUB_EVENT_NAME
) {
  if (eventName === 'schedule') {
    throw new Error(
      'scheduled-learning-retired: deliver causal evidence through existing event owners'
    );
  }
}
