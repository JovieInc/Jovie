import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mediaKindFor, scanSource, subtypeFor } from './scanner';

describe('scanner', () => {
  it('finds media recursively and skips hidden/non-media files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mi-scan-'));
    await mkdir(join(dir, 'nested'), { recursive: true });
    await writeFile(join(dir, 'a.jpg'), 'x');
    await writeFile(join(dir, 'nested', 'b.wav'), 'x');
    await writeFile(join(dir, 'notes.txt'), 'x');
    await writeFile(join(dir, '.hidden.jpg'), 'x');
    const found = await scanSource(dir);
    expect(found).toEqual([join(dir, 'a.jpg'), join(dir, 'nested', 'b.wav')]);
    await rm(dir, { recursive: true });
  });

  it('classifies kinds and subtypes', () => {
    expect(mediaKindFor('a.HEIC')).toBe('photo');
    expect(mediaKindFor('clip.MOV')).toBe('video');
    expect(mediaKindFor('memo.m4a')).toBe('audio');
    expect(mediaKindFor('x.txt')).toBe('unknown');
    expect(subtypeFor('shot.png', 'photo')).toBe('screenshot');
    expect(subtypeFor('Voice Memo 01.m4a', 'audio')).toBe('voice-memo');
    expect(subtypeFor('live at the echo.mp4', 'video')).toBe('live-clip');
    expect(subtypeFor('midnight-mv.mp4', 'video')).toBe('music-video');
  });
});
