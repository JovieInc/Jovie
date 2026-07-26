// Storybook's test widget launches Vitest without a --config argument and sets
// STORYBOOK_CONFIG_DIR for its child process. Route only that child to the
// browser project; normal local and CI Vitest lanes keep the optimized config.
const config = process.env.STORYBOOK_CONFIG_DIR
  ? (await import('./vitest.config.storybook.mts')).default
  : (await import('./vitest.config.fast.mts')).default;

export default config;
