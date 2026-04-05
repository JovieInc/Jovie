/**
 * Stub for statsig-node (package was removed but server.ts still imports it).
 * This file exists so Vite can resolve the import; vi.mock() overrides it in tests.
 */
const Statsig = {
  initialize: () => Promise.resolve(),
  getFeatureGateSync: () => ({
    value: false,
    evaluationDetails: { reason: 'Unrecognized' },
  }),
  getExperiment: () => Promise.resolve({ value: {} }),
  shutdown: () => Promise.resolve(),
};

export default Statsig;
