import { APP_ROUTES } from '@/constants/routes';

export const JOVIE_CLI_SOURCE_URL =
  'https://github.com/JovieInc/Jovie/tree/main/packages/jovie-cli';

export const JOVIE_CLI_COPY = {
  metadata: {
    title: 'Jovie CLI',
    description:
      'Use Jovie’s read-only public artist data, OpenAPI contract, and machine-readable guidance from a Node.js command line.',
  },
  hero: {
    headline: 'Public Jovie Data, From Your Terminal.',
    subtitle:
      'A read-only CLI for public artist profiles, OpenAPI, and llms.txt—no login or API key.',
    primaryCta: {
      href: JOVIE_CLI_SOURCE_URL,
      label: 'View The CLI Source',
    },
    secondaryCta: {
      href: APP_ROUTES.DEVELOPERS,
      label: 'Read The API Guide',
    },
  },
  commands: {
    eyebrow: 'Public CLI',
    title: 'One Public Surface. Four Commands.',
    description:
      'The package only reads documented public GET routes. It does not accept credentials, write files, cache responses, send telemetry, or mutate Jovie data.',
    source: {
      label: 'Run From Source Today',
      stateLabel: 'Public Repository',
      commands: [
        'git clone https://github.com/JovieInc/Jovie.git',
        'cd Jovie',
        'corepack enable',
        'pnpm install --frozen-lockfile',
        'pnpm --filter @jovie/cli dev -- api openapi --json',
      ],
    },
    npm: {
      label: 'Install After Registry Publication',
      stateLabel: 'Publication Pending',
      description:
        'The release path is tested, but @jovie/cli is not yet public. Continue only after npm view returns the released version.',
      commands: [
        'npm view @jovie/cli version',
        'npm install --global @jovie/cli',
        'jovie api openapi --json',
      ],
    },
    items: [
      {
        title: 'artist get <username>',
        description:
          'Fetch the public artist profile from GET /api/v1/{username}.',
      },
      {
        title: 'artist llms <username>',
        description:
          'Fetch the artist-specific machine-readable guide from GET /{username}/llms.txt.',
      },
      {
        title: 'api openapi',
        description:
          'Fetch the canonical public OpenAPI 3.1 contract as structured JSON.',
      },
      {
        title: 'docs llms [--full]',
        description:
          'Fetch the concise or expanded site-level machine-readable guide.',
      },
    ],
  },
  cta: {
    title: 'Inspect The CLI Before You Run It.',
    body: 'The source, tests, package boundary, and release workflow are public. npm availability remains gated on a successful registry and provenance receipt.',
    primaryLabel: 'View The CLI Source',
    primaryHref: JOVIE_CLI_SOURCE_URL,
    secondaryLabel: 'Read The API Guide',
    secondaryHref: APP_ROUTES.DEVELOPERS,
  },
} as const;
