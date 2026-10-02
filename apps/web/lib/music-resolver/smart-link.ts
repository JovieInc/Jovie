import 'server-only';

import {
  type InHouseQuery,
  type InHouseResolution,
  type InHouseSources,
  resolveInHouse,
} from './in-house';

/**
 * The smart-link creation contract from #20116, resolved only through the
 * in-house ladder. This module does not import MusicFetch.
 */
export type SmartLinkCreationQuery =
  | { readonly source: 'track_url'; readonly url: string }
  | { readonly source: 'isrc'; readonly isrc: string }
  | { readonly source: 'album_upc'; readonly upc: string }
  | { readonly source: 'album_url'; readonly url: string }
  | { readonly source: 'artist'; readonly name: string }
  | { readonly source: 'artist_url'; readonly url: string }
  | {
      readonly source: 'track_query';
      readonly artist: string;
      readonly title: string;
    };

export interface SmartLinkProvider {
  readonly key: string;
  readonly url: string;
}

export interface SmartLinkCandidate {
  readonly title: string;
  readonly artist: string | null;
  readonly url: string;
}

export type SmartLinkCreationResult =
  | {
      readonly status: 'resolved';
      readonly retryable: false;
      readonly title: string | null;
      readonly artist: string | null;
      readonly isrc: string | null;
      readonly upc: string | null;
      readonly providers: readonly SmartLinkProvider[];
      readonly confidence: number;
      readonly provenance: Readonly<Record<string, string>>;
    }
  | {
      readonly status: 'choices';
      readonly retryable: false;
      readonly candidates: readonly SmartLinkCandidate[];
    }
  | {
      readonly status: 'not_found';
      readonly retryable: false;
    }
  | {
      readonly status: 'upstream_failure';
      readonly retryable: true;
    };

function toQuery(input: SmartLinkCreationQuery): InHouseQuery {
  switch (input.source) {
    case 'track_url':
      return { kind: 'track', url: input.url };
    case 'isrc':
      return { kind: 'track', isrc: input.isrc };
    case 'album_upc':
      return { kind: 'album', upc: input.upc };
    case 'album_url':
      return { kind: 'album', url: input.url };
    case 'artist':
      return { kind: 'artist', name: input.name };
    case 'artist_url':
      return { kind: 'artist', url: input.url };
    case 'track_query':
      return { kind: 'track', artist: input.artist, title: input.title };
  }
}

function fromResolution(resolved: InHouseResolution): SmartLinkCreationResult {
  if (resolved.status === 'upstream_error') {
    return { status: 'upstream_failure', retryable: true };
  }
  if (resolved.status === 'ambiguous') {
    return {
      status: 'choices',
      retryable: false,
      candidates: resolved.candidates,
    };
  }
  if (resolved.status !== 'resolved' || resolved.links.length === 0) {
    return { status: 'not_found', retryable: false };
  }
  return {
    status: 'resolved',
    retryable: false,
    title: resolved.title,
    artist: resolved.artist,
    isrc: resolved.isrc,
    upc: resolved.upc,
    providers: resolved.links.map(link => ({
      key: link.provider,
      url: link.url,
    })),
    confidence: resolved.confidence,
    provenance: resolved.provenance,
  };
}

export async function resolveSmartLinkCreation(
  input: SmartLinkCreationQuery,
  sources?: InHouseSources
): Promise<SmartLinkCreationResult> {
  return fromResolution(await resolveInHouse(toQuery(input), sources));
}
