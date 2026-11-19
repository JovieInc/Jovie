import { describe, expect, it, vi } from 'vitest';
import {
  argumentValue,
  buildPublicLinkListPayload,
  collectLayloProfiles,
  collectLinktreeHandles,
  collectSmartLinkPages,
  considerPublicLink,
  harvestedFollowUps,
  layloProfiles,
  linktreeAccount,
  linktreeHandles,
  locs,
  numberArgumentValue,
  type PublicLinkListLead,
  type PublicPageRead,
  parseJsonValue,
  renderPublicLinkList,
  sampleItems,
  selectPublicLinkLeads,
  smartLinkLocs,
  stringAt,
} from './public-link-list';
import { observePublicLinkPage } from './public-link-observation';

const OBSERVED_AT = '2026-11-19T00:00:00.000Z';
const SPOTIFY = 'https://open.spotify.com/artist/northlinefixture';

function page(url: string, links: string[] = []) {
  const observed = observePublicLinkPage({
    url,
    displayName: 'Northline',
    links: links.map(link => ({ url: link })),
    observedAt: OBSERVED_AT,
  });
  if (!observed) throw new Error(url);
  return observed;
}

function lead(
  url: string,
  fitScore: number,
  hasOutboundDsp: boolean
): PublicLinkListLead {
  return {
    page: page(url, hasOutboundDsp ? [SPOTIFY] : []),
    fitScore,
    musicToolsDetected: [],
    hasRepresentation: false,
    representationSignal: null,
    hasOutboundDsp,
  };
}

describe('public link list selection', () => {
  it('reads arguments and samples evenly', () => {
    expect(argumentValue(['--out', 'out/leads.json'], '--out')).toBe(
      'out/leads.json'
    );
    expect(argumentValue(['--out', '--target'], '--out')).toBeNull();
    expect(numberArgumentValue(['--target', '80'], '--target', 120)).toBe(80);
    expect(numberArgumentValue(['--target', '0'], '--target', 120)).toBe(120);
    expect(sampleItems(['a', 'b'], 5)).toEqual(['a', 'b']);
    expect(sampleItems(['a', 'b', 'c', 'd'], 2)).toEqual(['a', 'c']);
  });

  it('keeps artist pages and drops reserved, contest, and broken locs', () => {
    expect(
      locs(
        '<loc> https://laylo.com/northline </loc><loc>https://ffm.to/x</loc>'
      )
    ).toEqual(['https://laylo.com/northline', 'https://ffm.to/x']);
    expect(
      layloProfiles([
        'https://www.laylo.com/northline',
        'https://laylo.com/login',
        'https://laylo.com/a/b',
        'https://ffm.to/northline',
        'not a url',
      ])
    ).toEqual(['https://www.laylo.com/northline']);
    expect(
      smartLinkLocs(
        [
          'https://ffm.to/northline',
          'https://ffm.to/win-a-copy',
          'https://ffm.to/ab',
          'https://laylo.com/northline',
          'not a url',
        ],
        'ffm.to'
      )
    ).toEqual(['https://ffm.to/northline']);
    expect(
      linktreeHandles(
        'https://linktr.ee/northline" https://linktr.ee/login" https://linktr.ee/other?'
      )
    ).toEqual(['northline', 'other']);
    expect(parseJsonValue('{')).toBeNull();
    expect(stringAt({ user: { id: ' user-1 ' } }, 'user', 'id')).toBe(
      ' user-1 '
    );
    expect(stringAt({ user: { id: '  ' } }, 'user', 'id')).toBeNull();
    expect(linktreeAccount('<html></html>')).toBeNull();
  });

  it('qualifies a fetched page once and tags the drop reason', () => {
    const built: PublicLinkListLead[] = [];
    const seen = new Set<string>();
    const dropped: Record<string, number> = {};
    considerPublicLink(null, built, seen, dropped);
    considerPublicLink(
      page('https://ffm.to/northline', [SPOTIFY]),
      built,
      seen,
      dropped
    );
    considerPublicLink(
      page('https://ffm.to/northline', [SPOTIFY]),
      built,
      seen,
      dropped
    );
    const contest = page('https://ffm.to/prize', [SPOTIFY]);
    considerPublicLink(
      { ...contest, displayName: 'Enter to win a copy' },
      built,
      seen,
      dropped
    );

    expect(built.map(item => item.page.url)).toEqual([
      'https://ffm.to/northline',
    ]);
    expect(built[0]?.hasOutboundDsp).toBe(true);
    expect(dropped).toMatchObject({
      unparsed: 1,
      contest_or_giveaway: 1,
    });
  });

  it('round-robins platforms and prefers outbound DSP once fifty exist', () => {
    const mixed = [
      lead('https://ffm.to/high', 50, false),
      lead('https://laylo.com/northline', 40, true),
      lead('https://ffm.to/low', 10, false),
    ];
    expect(selectPublicLinkLeads(mixed, 2).map(item => item.page.url)).toEqual([
      'https://ffm.to/high',
      'https://laylo.com/northline',
    ]);

    const dsp = Array.from({ length: 50 }, (_, index) =>
      lead(`https://ffm.to/track${index}`, 20, true)
    );
    const excluded = lead('https://ffm.to/kept-out', 90, false);
    const selected = selectPublicLinkLeads([...dsp, excluded], 50);
    expect(selected).toHaveLength(50);
    expect(selected.some(item => item.page.handle === 'kept-out')).toBe(false);
  });

  it('harvests follow-up smart links and renders a redacted intake payload', () => {
    const qualified = lead('https://ffm.to/northline', 40, true);
    const withFollowUps: PublicLinkListLead = {
      ...qualified,
      page: {
        ...qualified.page,
        bio: 'Mail northline@example.com',
        links: [
          ...qualified.page.links,
          { url: 'https://columbia.lnk.to/fakenews?utm=1' },
          { url: 'https://linktr.ee/other' },
          { url: 'https://linktr.ee/login' },
        ],
      },
    };
    const harvested = harvestedFollowUps([withFollowUps]);
    expect([...harvested.smartLinks]).toEqual([
      'https://columbia.lnk.to/fakenews',
    ]);
    expect([...harvested.linktree]).toEqual(['other']);

    const payload = buildPublicLinkListPayload({
      generatedAt: OBSERVED_AT,
      maxRequests: 10,
      budgetLeft: 4,
      built: [withFollowUps, lead('https://ffm.to/other', 10, false)],
      selected: [withFollowUps],
      dropped: { unparsed: 1 },
    });
    expect(payload.counts).toMatchObject({
      requests: 6,
      considered: 2,
      qualified: 1,
    });
    expect(payload.intake.pages[0]?.links.map(link => link.url)).not.toContain(
      'https://ffm.to/northline'
    );
    const rendered = renderPublicLinkList(payload);
    expect(rendered).toContain('Mail ');
    expect(rendered).not.toContain('northline@example.com');
  });

  it('collects laylo, feature.fm, and linktree pages from a supplied reader', async () => {
    const read = vi.fn<PublicPageRead>(async url => {
      if (url.endsWith('/northline/profile.json')) {
        return JSON.stringify({
          user: { id: 'user-1', username: 'northline' },
        });
      }
      if (url.endsWith('/users/user-1.json')) {
        return JSON.stringify({
          username: 'northline',
          displayName: 'Northline',
          spotify: SPOTIFY,
        });
      }
      if (url === 'https://ffm.to/northline') {
        return `<title>Northline</title><a href="${SPOTIFY}">play</a>`;
      }
      if (url === 'https://linktr.ee/missing') return '<html></html>';
      if (url === 'https://linktr.ee/northline') {
        return `<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"account":{"username":"northline","pageTitle":"Northline","links":[{"url":"${SPOTIFY}"},{"url":"https://ffm.to/northline-single"}]}}}}</script>`;
      }
      return null;
    });
    const built: PublicLinkListLead[] = [];
    const seen = new Set<string>();
    const dropped: Record<string, number> = {};
    const budget = { left: 20 };
    await collectLayloProfiles(
      ['', 'https://laylo.com/missing', 'https://laylo.com/northline'],
      budget,
      built,
      seen,
      dropped,
      read,
      OBSERVED_AT
    );
    await collectSmartLinkPages(
      ['https://ffm.to/missing', 'https://ffm.to/northline'],
      budget,
      built,
      seen,
      dropped,
      read,
      OBSERVED_AT
    );
    await collectLinktreeHandles(
      ['missing', 'northline'],
      budget,
      built,
      seen,
      dropped,
      read,
      OBSERVED_AT
    );

    expect(built.map(item => item.page.url).sort()).toEqual([
      'https://ffm.to/northline',
      'https://laylo.com/northline',
      'https://linktr.ee/northline',
    ]);
    expect(dropped.fetch_failed).toBe(2);
    expect(dropped.unparsed).toBe(1);
    expect(linktreeAccount('<script id="__NEXT_DATA__">{</script>')).toBeNull();
  });
});
