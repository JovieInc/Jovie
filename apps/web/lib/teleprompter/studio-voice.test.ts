import { describe, expect, it, vi } from 'vitest';
import {
  classifyVoiceOutput,
  createQuestionSpeaker,
  detectVoiceOutput,
  voiceStartsOn,
  voiceStatusCopy,
} from './studio-voice';

const output = (label: string, deviceId = 'default') => ({
  kind: 'audiooutput',
  deviceId,
  label,
});

describe('classifyVoiceOutput', () => {
  it('treats built-in laptop speakers as speakers', () => {
    expect(
      classifyVoiceOutput([output('Default - MacBook Pro Speakers (Built-in)')])
    ).toBe('speakers');
  });

  it('treats named headphones as headphones', () => {
    expect(classifyVoiceOutput([output('Default - AirPods Pro')])).toBe(
      'headphones'
    );
    expect(classifyVoiceOutput([output('External Headphones')])).toBe(
      'headphones'
    );
    expect(classifyVoiceOutput([output('WH-1000XM5')])).toBe('headphones');
  });

  it('keeps her muted on speakers that only name a brand or interface', () => {
    expect(classifyVoiceOutput([output('Bluetooth Speaker')])).toBe('speakers');
    expect(classifyVoiceOutput([output('Scarlett 2i2 USB')])).toBe('unknown');
    expect(classifyVoiceOutput([output('Beats Pill')])).toBe('unknown');
  });

  it('reads the default device when several outputs exist', () => {
    expect(
      classifyVoiceOutput([
        output('AirPods Pro', 'abc'),
        output('Default - MacBook Air Speakers'),
      ])
    ).toBe('speakers');
  });

  it('returns unknown when labels are hidden or there is no output', () => {
    expect(classifyVoiceOutput([output('')])).toBe('unknown');
    expect(
      classifyVoiceOutput([{ kind: 'audioinput', deviceId: 'x', label: 'Mic' }])
    ).toBe('unknown');
    expect(classifyVoiceOutput([])).toBe('unknown');
  });
});

describe('detectVoiceOutput', () => {
  it('reads devices from the browser', async () => {
    const enumerateDevices = vi
      .fn()
      .mockResolvedValue([output('Default - AirPods Max')]);
    await expect(detectVoiceOutput({ enumerateDevices })).resolves.toBe(
      'headphones'
    );
  });

  it('fails closed when the browser refuses', async () => {
    const enumerateDevices = vi.fn().mockRejectedValue(new Error('no'));
    await expect(detectVoiceOutput({ enumerateDevices })).resolves.toBe(
      'unknown'
    );
    await expect(detectVoiceOutput(undefined)).resolves.toBe('unknown');
  });
});

describe('voice defaults and copy', () => {
  it('starts on only with headphones', () => {
    expect(voiceStartsOn('headphones')).toBe(true);
    expect(voiceStartsOn('speakers')).toBe(false);
    expect(voiceStartsOn('unknown')).toBe(false);
  });

  it('tells the creator why her voice is off', () => {
    expect(
      voiceStatusCopy({ kind: 'speakers', enabled: false, supported: true })
    ).toMatch(/laptop speakers/);
    expect(
      voiceStatusCopy({ kind: 'unknown', enabled: false, supported: true })
    ).toMatch(/headphones in/);
    expect(
      voiceStatusCopy({ kind: 'headphones', enabled: true, supported: true })
    ).toMatch(/aloud/);
    expect(
      voiceStatusCopy({ kind: 'headphones', enabled: true, supported: false })
    ).toMatch(/can't read/);
  });
});

describe('createQuestionSpeaker', () => {
  it('speaks one question at a time', () => {
    const synth = {
      speak: vi.fn(),
      cancel: vi.fn(),
    } as unknown as SpeechSynthesis;
    class FakeUtterance {
      rate = 0;
      pitch = 0;
      constructor(readonly text: string) {}
    }
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    const speaker = createQuestionSpeaker(synth);
    expect(speaker.supported).toBe(true);
    speaker.speak('Who is this one for?');
    expect(synth.cancel).toHaveBeenCalled();
    expect(synth.speak).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Who is this one for?' })
    );
    vi.unstubAllGlobals();
  });

  it('is a no-op without speech synthesis', () => {
    const speaker = createQuestionSpeaker(undefined);
    expect(speaker.supported).toBe(false);
    expect(() => speaker.speak('hi')).not.toThrow();
  });
});
