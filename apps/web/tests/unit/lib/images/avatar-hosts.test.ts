import { describe, expect, it } from 'vitest';
import { isAllowedAvatarHostname } from '@/lib/images/avatar-hosts';

describe('isAllowedAvatarHostname', () => {
  it('allows known direct hosts', () => {
    expect(isAllowedAvatarHostname('i.scdn.co')).toBe(true);
    expect(isAllowedAvatarHostname('img.clerk.com')).toBe(true);
    expect(isAllowedAvatarHostname('cdn.linktr.ee')).toBe(true);
  });

  it('allows wildcard subdomains for supported CDNs', () => {
    expect(isAllowedAvatarHostname('lineup-images.scdn.co')).toBe(true);
    expect(isAllowedAvatarHostname('wrapped-images.spotifycdn.com')).toBe(true);
    expect(isAllowedAvatarHostname('pbs.twimg.com')).toBe(true);
    expect(isAllowedAvatarHostname('lh3.googleusercontent.com')).toBe(true);
    expect(isAllowedAvatarHostname('platform-lookaside.fbsbx.com')).toBe(true);
  });

  it('allows music DSP CDNs', () => {
    expect(isAllowedAvatarHostname('is5-ssl.mzstatic.com')).toBe(true);
    expect(isAllowedAvatarHostname('i1.sndcdn.com')).toBe(true);
    expect(isAllowedAvatarHostname('f4.bcbits.com')).toBe(true);
    expect(isAllowedAvatarHostname('resources.tidal.com')).toBe(true);
    expect(isAllowedAvatarHostname('listen.tidal.com')).toBe(true);
    expect(isAllowedAvatarHostname('e-cdns-images.dzcdn.net')).toBe(true);
    expect(isAllowedAvatarHostname('m.media-amazon.com')).toBe(true);
    expect(isAllowedAvatarHostname('geo-media.beatport.com')).toBe(true);
    expect(isAllowedAvatarHostname('content-images.p-cdn.com')).toBe(true);
  });

  it('allows social network CDNs', () => {
    expect(isAllowedAvatarHostname('p16-sign-sg.tiktokcdn.com')).toBe(true);
    expect(isAllowedAvatarHostname('p77-sign-va.tiktokcdn-us.com')).toBe(true);
    expect(isAllowedAvatarHostname('i.ytimg.com')).toBe(true);
    expect(isAllowedAvatarHostname('yt3.ggpht.com')).toBe(true);
    expect(isAllowedAvatarHostname('media.licdn.com')).toBe(true);
    expect(isAllowedAvatarHostname('cf-st.sc-cdn.net')).toBe(true);
    expect(isAllowedAvatarHostname('i.pinimg.com')).toBe(true);
    expect(isAllowedAvatarHostname('preview.redd.it')).toBe(true);
    expect(isAllowedAvatarHostname('styles.redditmedia.com')).toBe(false); // not redditstatic.com
    expect(isAllowedAvatarHostname('www.redditstatic.com')).toBe(true);
    expect(isAllowedAvatarHostname('scontent.cdninstagram.com')).toBe(true);
  });

  it('allows creator platform CDNs', () => {
    expect(isAllowedAvatarHostname('static-cdn.jtvnw.net')).toBe(true);
    expect(isAllowedAvatarHostname('cdn.discordapp.com')).toBe(true);
    expect(isAllowedAvatarHostname('c10.patreonusercontent.com')).toBe(true);
    expect(isAllowedAvatarHostname('bucketeer-abc.substackcdn.com')).toBe(true);
    expect(isAllowedAvatarHostname('miro.medium.com')).toBe(true);
    expect(isAllowedAvatarHostname('avatars.githubusercontent.com')).toBe(true);
    expect(isAllowedAvatarHostname('mir-s3-cdn-cf.behance.net')).toBe(true);
    expect(isAllowedAvatarHostname('cdn.dribbble.com')).toBe(true);
  });

  it('rejects lookalike attacker domains', () => {
    expect(isAllowedAvatarHostname('i.scdn.co.attacker.com')).toBe(false);
    expect(isAllowedAvatarHostname('evil.spotifycdn.com.attacker.com')).toBe(
      false
    );
    expect(isAllowedAvatarHostname('tiktokcdn.com.evil.com')).toBe(false);
    expect(isAllowedAvatarHostname('fake-ytimg.com')).toBe(false);
    expect(isAllowedAvatarHostname('notlicdn.com')).toBe(false);
  });
});
