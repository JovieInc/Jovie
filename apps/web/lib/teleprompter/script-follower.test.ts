import { describe, expect, it } from 'vitest';
import {
  AUTO_SCROLL_DEFAULT_WPM,
  autoScrollWordIndex,
  clampWordsPerMinute,
  ScriptFollower,
} from './script-follower';

// Cases mirror apps/ios/JovieTests/VoiceCaptureServiceTests.swift so web and
// iOS follow a read the same way.
describe('ScriptFollower', () => {
  it('follows words and recovers after off-script speech', () => {
    const follower = new ScriptFollower(
      'Today we are building a calmer path for independent artists'
    );

    follower.ingest('Today we are building');
    expect(follower.nextWordIndex).toBe(4);
    expect(follower.alignment).toBe('aligned');

    follower.ingest('Today we are building honestly this part is a rant');
    expect(follower.nextWordIndex).toBe(4);
    expect(follower.alignment).toBe('offScript');

    follower.ingest(
      'Today we are building honestly this part is a rant a calmer path for'
    );
    expect(follower.nextWordIndex).toBe(8);
    expect(follower.alignment).toBe('aligned');
  });

  it('re-anchors after a manual resume without ending capture', () => {
    const follower = new ScriptFollower('one two three four five six seven');
    follower.ingest('one two three');
    follower.previewSeek(5);
    expect(follower.nextWordIndex).toBe(5);
    expect(follower.alignment).toBe('manual');

    follower.resume(5);
    follower.ingest('one two three six seven');
    expect(follower.nextWordIndex).toBe(7);
    expect(follower.alignment).toBe('aligned');
  });

  it('skips punctuation-only script tokens', () => {
    const follower = new ScriptFollower('hello — artists');
    follower.ingest('hello artists');
    expect(follower.displayWords).toEqual(['hello', 'artists']);
    expect(follower.nextWordIndex).toBe(2);
    expect(follower.isComplete).toBe(true);
  });

  it('holds during a tangent and rejoins only on a strong suffix', () => {
    const follower = new ScriptFollower(
      'one two three four five six seven eight'
    );
    follower.ingest('one two');
    expect(follower.nextWordIndex).toBe(2);

    follower.ingest('one two tangent tangent');
    expect(follower.alignment).toBe('offScript');
    expect(follower.nextWordIndex).toBe(2);

    follower.ingest('one two tangent tangent three');
    expect(follower.nextWordIndex).toBe(2);

    follower.ingest('one two tangent tangent three four five six seven eight');
    expect(follower.alignment).toBe('aligned');
    expect(follower.nextWordIndex).toBe(8);
  });

  it('keeps following across a Web Speech session restart', () => {
    const follower = new ScriptFollower('save the night tonight at the shrine');
    follower.ingest('save the night');
    expect(follower.nextWordIndex).toBe(3);

    // The engine ended on silence; the next session starts from empty.
    follower.resetTranscriptAnchor();
    follower.ingest('tonight');
    follower.ingest('tonight at the');
    expect(follower.nextWordIndex).toBe(6);
  });

  it('matches case and punctuation loosely, including non-English letters', () => {
    const follower = new ScriptFollower("Gracias, Méjico! It's time.");
    expect(follower.displayWords).toHaveLength(4);
    follower.ingest('GRACIAS méjico');
    expect(follower.nextWordIndex).toBe(2);
    // "It's" is one script word; the engine's extra "s" is a revision gap.
    follower.ingest('GRACIAS méjico it s time');
    expect(follower.nextWordIndex).toBe(4);
    expect(follower.alignment).toBe('aligned');
  });

  it('ignores empty transcripts and empty scripts', () => {
    const empty = new ScriptFollower('   ');
    empty.ingest('anything');
    expect(empty.nextWordIndex).toBe(0);
    expect(empty.progress).toBe(0);

    const follower = new ScriptFollower('one two');
    follower.ingest('');
    expect(follower.nextWordIndex).toBe(0);
  });

  it('clamps seeks to the script bounds', () => {
    const follower = new ScriptFollower('one two three');
    follower.previewSeek(99);
    expect(follower.nextWordIndex).toBe(3);
    follower.resume(-4);
    expect(follower.nextWordIndex).toBe(0);
    expect(follower.snapshot().alignment).toBe('aligned');
  });
});

describe('auto scroll', () => {
  it('advances at the chosen pace from the start index', () => {
    expect(
      autoScrollWordIndex({
        elapsedMs: 30_000,
        wordsPerMinute: 120,
        startIndex: 4,
        wordCount: 200,
      })
    ).toBe(64);
  });

  it('never runs past the end of the script', () => {
    expect(
      autoScrollWordIndex({
        elapsedMs: 600_000,
        wordsPerMinute: 220,
        startIndex: 0,
        wordCount: 40,
      })
    ).toBe(40);
  });

  it('clamps speed to the iOS range', () => {
    expect(clampWordsPerMinute(10)).toBe(60);
    expect(clampWordsPerMinute(400)).toBe(220);
    expect(clampWordsPerMinute(Number.NaN)).toBe(AUTO_SCROLL_DEFAULT_WPM);
  });
});
