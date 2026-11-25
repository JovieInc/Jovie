/** Classification + disposition for Apple developer RSS items. */

export const CATEGORIES = Object.freeze([
  'security',
  'compatibility',
  'reliability',
  'performance',
  'ux',
  'testing',
  'ci',
]);

export const TARGETS = Object.freeze([
  'jovie-ios',
  'lyb-ios',
  'jovie-macos',
  'native-ci',
]);

/** @typedef {'action' | 'no-action' | 'compatibility-lane'} Disposition */

export const BETA =
  /\b(beta|seed|rc\b|release candidate|developer preview|xcode cloud preview)\b/i;
const SECURITY =
  /\b(security|cve-|vulnerability|exploit|privacy|gatekeeper|notariz|codesign|entitlement|app.?attest|privacy.?manifest)\b/i;
const PERFORMANCE =
  /\b(performance|latency|memory|jank|instruments|metric.?kit|os.?signpost)\b/i;
const UX =
  /\b(human interface|hig\b|accessibility|voiceover|dynamic type|swiftui|design(?:\s+guidance)?)\b/i;
const TESTING = /\b(testflight|xcui|xctest|testing|simulator|ui testing)\b/i;
const CI =
  /\b(xcode|swift(?:ui|pm)?|sdk|toolchain|compiler|build system|ci\b)\b/i;
export const DISTRIBUTION =
  /\b(app store connect|distribution|notariz|export compliance|review guideline|privacy nutrition|required reason)\b/i;
const RELIABILITY = /\b(crash|hang|watchdog|stability|regression|fix)\b/i;
export const WWDC = /\b(wwdc|session \d+|developer\.apple\.com\/videos)\b/i;

const PLATFORM = {
  ios: /\b(ios|ipados|iphone|ipad)\b/i,
  macos: /\b(macos|mac\s?os|appkit|catalyst)\b/i,
  xcode: /\b(xcode|swift(?:ui|pm)?|sdk)\b/i,
  distribution: DISTRIBUTION,
  otherApple: /\b(tvos|watchos|visionos|homeview|airpods|apple tv)\b/i,
};

/**
 * @param {{title: string, summary?: string}} item
 * @returns {{categories: string[], targets: string[], lane: 'production' | 'compatibility', platformHit: boolean}}
 */
export function classifyItem(item) {
  const text = `${item.title}\n${item.summary ?? ''}`;
  /** @type {Set<string>} */
  const categories = new Set();
  /** @type {Set<string>} */
  const targets = new Set();

  if (SECURITY.test(text)) categories.add('security');
  if (PERFORMANCE.test(text)) categories.add('performance');
  if (UX.test(text)) categories.add('ux');
  if (TESTING.test(text)) categories.add('testing');
  if (CI.test(text) || PLATFORM.xcode.test(text)) categories.add('ci');
  if (RELIABILITY.test(text)) categories.add('reliability');
  if (
    DISTRIBUTION.test(text) ||
    PLATFORM.ios.test(text) ||
    PLATFORM.macos.test(text)
  )
    categories.add('compatibility');

  const ios = PLATFORM.ios.test(text);
  const macos = PLATFORM.macos.test(text);
  const xcode = PLATFORM.xcode.test(text);
  const distribution = PLATFORM.distribution.test(text);
  const otherOnly =
    PLATFORM.otherApple.test(text) && !ios && !macos && !xcode && !distribution;

  if (ios || xcode || distribution) {
    targets.add('jovie-ios');
    targets.add('lyb-ios');
  }
  if (macos || xcode) targets.add('jovie-macos');
  if (xcode || CI.test(text)) targets.add('native-ci');

  if (categories.size === 0) {
    if (WWDC.test(text) || UX.test(text)) categories.add('ux');
    else if (xcode) categories.add('ci');
    else categories.add('compatibility');
  }

  const lane = BETA.test(text) ? 'compatibility' : 'production';
  if (lane === 'compatibility') categories.add('compatibility');

  return {
    categories: [...categories].filter(c => CATEGORIES.includes(c)).sort(),
    targets: [...targets].filter(t => TARGETS.includes(t)).sort(),
    lane,
    platformHit: !otherOnly && targets.size > 0,
  };
}

/**
 * @param {{title: string, summary?: string, contentHash: string}} item
 * @param {ReturnType<typeof classifyItem>} classified
 * @param {{priorHash?: string | null}} [opts]
 */
export function decideDisposition(item, classified, opts = {}) {
  const revision =
    opts.priorHash != null && opts.priorHash !== item.contentHash;

  if (!classified.platformHit) {
    return {
      disposition: /** @type {Disposition} */ ('no-action'),
      justification:
        'Outside Jovie/LYB iOS/macOS ownership (tvOS/watchOS/visionOS-only or no mapped target).',
      revision,
    };
  }

  if (classified.lane === 'compatibility') {
    return {
      disposition: /** @type {Disposition} */ ('compatibility-lane'),
      justification:
        'Beta/seed/RC or preview toolchain — isolate in compatibility lane; do not adopt in production pins.',
      revision,
    };
  }

  if (classified.categories.includes('security')) {
    return {
      disposition: /** @type {Disposition} */ ('action'),
      justification:
        'Security-relevant Apple change mapped to owned targets; review release notes and entitlements before next ship.',
      revision,
    };
  }

  if (
    classified.categories.includes('ci') &&
    /\bxcode\b/i.test(item.title) &&
    !BETA.test(item.title)
  ) {
    return {
      disposition: /** @type {Disposition} */ ('action'),
      justification:
        'GA Xcode/SDK release may require CI image or Package.resolved verification on native lanes.',
      revision,
    };
  }

  if (DISTRIBUTION.test(`${item.title}\n${item.summary ?? ''}`)) {
    return {
      disposition: /** @type {Disposition} */ ('action'),
      justification:
        'App Store Connect / distribution policy surface — verify shipping checklist before next submission.',
      revision,
    };
  }

  if (WWDC.test(`${item.title}\n${item.summary ?? ''}`)) {
    return {
      disposition: /** @type {Disposition} */ ('no-action'),
      justification:
        'WWDC/session signal recorded for awareness; no executable production change without a mapped defect or adoption task.',
      revision,
    };
  }

  return {
    disposition: /** @type {Disposition} */ ('no-action'),
    justification:
      'Observed and classified; no justified executable next action for owned targets on this item alone.',
    revision,
  };
}
