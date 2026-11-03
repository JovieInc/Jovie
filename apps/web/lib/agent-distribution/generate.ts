import { lintCopy } from '@jovie/copy';
import { canonicalJson, hashTools, sha256 } from './hash';
import { ICON_SIZES, type IconSourceInfo } from './icons';
import type { Listing } from './listing';
import {
  bullets,
  code,
  comment,
  fence,
  heading,
  numbered,
  page,
} from './markdown';
import { evaluateAll, type ReadinessInputs } from './readiness';

export interface DistributionTool {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema: unknown;
  readonly annotations?: Record<string, unknown>;
}

export interface DistributionIssues {
  /** Generation is invalid: limits, banned words, missing explicit hints. */
  readonly errors: string[];
  /** Listing cannot be submitted yet, but the registry itself is not wrong. */
  readonly blockers: string[];
}

export const LIMITS = {
  chatgpt: { displayName: 30, shortDescription: 30, longDescription: 4000 },
  claude: { name: 100, oneLiner: 200, description: 2000, categories: [1, 5] },
} as const;
export const ICON_OUTPUT_DIR = '.agent-distribution-out/icons';
export const REQUIRED_HINTS = [
  'readOnlyHint',
  'destructiveHint',
  'openWorldHint',
] as const;
const BANNED = /\bfans?\b/i;
export const REGENERATE_COMMAND =
  'pnpm --filter @jovie/web agent-distribution:generate';

export function validateDistribution(
  tools: readonly DistributionTool[],
  listing: Listing
): DistributionIssues {
  const errors: string[] = [];
  const blockers: string[] = [];
  for (const tool of tools) {
    if (!tool.title?.trim())
      blockers.push(
        `tool ${tool.name}: no title in the registry (Claude and ChatGPT reviews expect one)`
      );
    for (const hint of REQUIRED_HINTS)
      if (typeof tool.annotations?.[hint] !== 'boolean')
        errors.push(`tool ${tool.name}: annotations.${hint} must be explicit`);
  }
  const check = (label: string, text: string, max?: number) => {
    if (max !== undefined && text.length > max)
      errors.push(`${label}: ${text.length} chars, limit ${max}`);
    if (BANNED.test(text)) errors.push(`${label}: banned word`);
    const lint = lintCopy(text, { register: 'jovie-marketing' });
    for (const finding of lint.blocking)
      errors.push(`${label}: copy lint ${finding.rule} ("${finding.match}")`);
  };
  check('chatgpt.displayName', listing.name, LIMITS.chatgpt.displayName);
  check(
    'chatgpt.shortDescription',
    listing.chatgptShort,
    LIMITS.chatgpt.shortDescription
  );
  check(
    'chatgpt.longDescription',
    listing.longDescription,
    LIMITS.chatgpt.longDescription
  );
  check('claude.name', listing.name, LIMITS.claude.name);
  check('claude.oneLiner', listing.oneLiner, LIMITS.claude.oneLiner);
  check(
    'claude.description',
    listing.longDescription,
    LIMITS.claude.description
  );
  const [minCat, maxCat] = LIMITS.claude.categories;
  if (listing.categories.length < minCat || listing.categories.length > maxCat)
    errors.push(`claude.categories: need ${minCat}-${maxCat}`);
  listing.examplePrompts.forEach((p, i) => check(`examplePrompts[${i}]`, p));
  listing.useCases.forEach((p, i) => check(`useCases[${i}]`, p));
  listing.positiveTests.forEach((t, i) => {
    check(`positiveTests[${i}].prompt`, t.prompt);
    check(`positiveTests[${i}].expected`, t.expected);
    for (const name of t.tools)
      if (!tools.some(tool => tool.name === name))
        errors.push(`positiveTests[${i}]: unknown tool ${name}`);
  });
  listing.negativeTests.forEach((t, i) => {
    check(`negativeTests[${i}].prompt`, t.prompt);
    check(`negativeTests[${i}].expected`, t.expected);
  });
  check('dataHandling', listing.dataHandling);
  for (const [key, value] of Object.entries(listing.docsPage))
    for (const [i, text] of [value].flat().entries())
      check(`docsPage.${key}.${i}`, text);
  if (listing.positiveTests.length < 5)
    errors.push('chatgpt: need at least 5 positive test cases');
  if (listing.negativeTests.length < 3)
    errors.push('chatgpt: need at least 3 negative test cases');
  blockers.push(
    'icons: render the 48, 64, 512 and 1024 PNGs with agent-distribution:icons before uploading to a marketplace'
  );
  return { errors, blockers };
}

export interface DistributionOutput {
  readonly files: Record<string, string>;
  readonly issues: DistributionIssues;
  readonly toolsListHash: string;
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export function buildDistribution(
  tools: readonly DistributionTool[],
  listing: Listing,
  assets: Record<string, string> = {},
  readinessInputs: ReadinessInputs | null = null,
  icons: IconSourceInfo | null = null
): DistributionOutput {
  const served = tools.map(t => ({ ...t }));
  const toolsListHash = hashTools(served);
  const listingHash = sha256(canonicalJson(listing));
  const issues = validateDistribution(tools, listing);
  if (icons)
    issues.blockers.splice(
      0,
      issues.blockers.length,
      ...issues.blockers.filter(b => !b.startsWith('icons:'))
    );
  const version = (adapter: string) =>
    sha256(`${toolsListHash}:${listingHash}:${adapter}`).slice(0, 12);
  const provenance = (adapter: string) => ({
    version: version(adapter),
    toolsListHash,
    listingHash,
    regenerate: REGENERATE_COMMAND,
  });
  const toolSummary = tools.map(t => ({
    name: t.name,
    title: t.title ?? null,
    description: t.description,
    annotations: t.annotations ?? {},
  }));

  const muse = {
    _generated: provenance('muse'),
    overview: {
      name: listing.name,
      company: listing.company,
      website: listing.website,
      description: listing.oneLiner,
      examplePrompts: listing.examplePrompts,
      icon512: `${ICON_OUTPUT_DIR}/icon-512.png`,
      icons: Object.fromEntries(
        ICON_SIZES.map(size => [size, `${ICON_OUTPUT_DIR}/icon-${size}.png`])
      ),
      acceptsPayments: false,
      contact: listing.supportEmail,
      supportUrl: listing.supportUrl,
      privacyPolicyUrl: listing.privacyUrl,
      termsUrl: listing.termsUrl,
    },
    technical: {
      connectionType: 'Existing MCP',
      url: listing.mcpUrl,
      docsUrl: listing.docsUrl,
      accessRequirements: listing.accessRequirements,
      authentication: 'none',
    },
    tools: toolSummary,
  };

  const grokServer = {
    type: 'mcp',
    server_url: listing.mcpUrl,
    server_label: listing.serverLabel,
  };
  const g = listing.grokPage;
  const grokMd = page([
    comment(
      `generated: version ${version('grok')}, tools/list ${toolsListHash}`
    ),
    heading(1, g.title),
    listing.oneLiner,
    heading(2, g.addHeading),
    numbered(g.steps),
    [g.urlLabel, code(listing.mcpUrl)].join(': '),
    heading(2, g.tryHeading),
    bullets(listing.examplePrompts),
    heading(2, g.toolsHeading),
    bullets(tools.map(t => [code(t.name), t.description].join(': '))),
    heading(2, g.apiHeading),
    g.apiIntro,
    fence('json', JSON.stringify(grokServer, null, 2)),
    heading(2, g.supportHeading),
    bullets([
      [g.privacyLabel, listing.privacyUrl].join(': '),
      [g.termsLabel, listing.termsUrl].join(': '),
      [g.supportLabel, listing.supportUrl].join(': '),
    ]),
  ]);

  const chatgptRoot = 'chatgpt/jovie-agent';
  const toTest = (t: (typeof listing.positiveTests)[number]) => ({
    description: t.description,
    prompt: t.prompt,
    tools_triggered: t.tools,
    expected_behavior: t.expected,
  });
  const chatgptPlugin = {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: 'jovie-agent',
    version: version('chatgpt'),
    description: listing.oneLiner,
    author: {
      name: listing.company,
      email: listing.supportEmail,
      url: listing.website,
    },
    homepage: listing.website,
    repository: 'https://github.com/JovieInc/Jovie',
    keywords: ['music', 'artists', 'release', 'smart link'],
    extensions: {
      'com.openai': {
        interface: {
          displayName: listing.name,
          shortDescription: listing.chatgptShort,
          longDescription: listing.longDescription,
          developerName: listing.company,
          category: listing.categories[0],
          capabilities: tools.map(t => t.title ?? t.name),
          websiteURL: listing.website,
          supportURL: listing.supportUrl,
          privacyPolicyURL: listing.privacyUrl,
          termsOfServiceURL: listing.termsUrl,
          defaultPrompt: listing.examplePrompts.slice(0, 3),
          brandColor: listing.brandColor,
          brandColorDark: listing.brandColor,
          composerIcon: './assets/icon.svg',
          composerIconDark: './assets/icon-dark.svg',
          logo: './assets/logo.svg',
          logoDark: './assets/logo-dark.svg',
        },
        review: {
          test_cases: {
            positive: listing.positiveTests.map(toTest),
            negative: listing.negativeTests.map(t => ({
              description: t.description,
              prompt: t.prompt,
              expected_behavior: t.expected,
            })),
          },
          commerce: false,
          commerce_description: listing.commerceDescription,
        },
        publication: {
          release_notes: [
            listing.releaseNotesLead,
            tools.map(t => t.name).join(', '),
          ].join(' '),
        },
      },
    },
    _generated: provenance('chatgpt'),
  };
  const chatgptMcp = {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
    mcpServers: {
      [listing.serverLabel]: { type: 'streamable-http', url: listing.mcpUrl },
    },
  };

  const claude = {
    _generated: provenance('claude'),
    name: listing.name,
    oneLiner: listing.oneLiner,
    description: listing.longDescription,
    categories: listing.categories,
    documentationUrl: listing.docsUrl,
    privacyPolicyUrl: listing.privacyUrl,
    supportUrl: listing.supportUrl,
    serverUrl: listing.mcpUrl,
    useCases: listing.useCases,
    authentication: 'none',
    dataHandling: listing.dataHandling,
    reviewerInstructions: listing.reviewerNotes.join('\n'),
    exampleTests: {
      positive: listing.positiveTests.map(toTest),
    },
    tools: toolSummary,
  };

  const platforms = readinessInputs
    ? evaluateAll(readinessInputs, listing, toolsListHash, null)
    : null;
  const readiness = {
    _generated: provenance('readiness'),
    ready:
      issues.blockers.length === 0 &&
      platforms !== null &&
      Object.values(platforms).every(p => p.ready),
    blockers: issues.blockers,
    timeChecks:
      'Receipt age and deadlines are checked by the agent-distribution:ready script, not here.',
    platforms,
  };

  const files: Record<string, string> = {
    'tools-list.snapshot.json': json({ toolsListHash, tools: served }),
    'readiness.json': json(readiness),
    'muse/connector-form.json': json(muse),
    'grok/use-jovie-in-grok.md': grokMd,
    'grok/xai-remote-mcp.json': json(grokServer),
    [`${chatgptRoot}/plugin.json`]: json(chatgptPlugin),
    [`${chatgptRoot}/mcp.json`]: json(chatgptMcp),
    'claude/directory-listing.json': json(claude),
  };
  for (const [path, content] of Object.entries(assets))
    files[`${chatgptRoot}/assets/${path}`] = content;
  files['manifest.json'] = json({
    ...provenance('manifest'),
    icons,
    files: Object.keys(files).sort(),
    versions: Object.fromEntries(
      ['muse', 'grok', 'chatgpt', 'claude'].map(a => [a, version(a)])
    ),
  });
  return { files, issues, toolsListHash };
}
