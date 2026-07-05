import { describe, expect, it } from 'vitest';
import {
  canMessageAudienceMember,
  getAudienceDisplayName,
  isAudienceMemberAnonymous,
} from '@/components/features/dashboard/organisms/dashboard-audience-table/row-contract';
import type { AudienceMember } from '@/types';

const anonymousMember: Pick<
  AudienceMember,
  | 'displayName'
  | 'email'
  | 'emailVisibleToArtist'
  | 'phone'
  | 'spotifyConnected'
> = {
  displayName: null,
  email: null,
  phone: null,
  spotifyConnected: false,
};

const identifiedMember: Pick<
  AudienceMember,
  | 'displayName'
  | 'email'
  | 'emailVisibleToArtist'
  | 'phone'
  | 'spotifyConnected'
> = {
  displayName: 'Tim',
  email: 'tim@example.com',
  emailVisibleToArtist: true,
  phone: null,
  spotifyConnected: false,
};

describe('audience row contract', () => {
  it('treats fully anonymous rows as non-messageable', () => {
    expect(isAudienceMemberAnonymous(anonymousMember)).toBe(true);
    expect(canMessageAudienceMember(anonymousMember)).toBe(false);
  });

  it('allows messaging identified fans with a reachable channel', () => {
    expect(canMessageAudienceMember(identifiedMember)).toBe(true);
  });

  it('uses Fan instead of Visitor for unidentified but non-anonymous rows', () => {
    expect(
      getAudienceDisplayName({
        ...anonymousMember,
        phone: '+14155550123',
      })
    ).toBe('Fan');
  });
});
