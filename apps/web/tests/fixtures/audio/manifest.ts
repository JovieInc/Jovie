import type { AudioFormatId } from '@jovie/audio-contracts';

export type CanPlayTypeResult = '' | 'maybe' | 'probably';

export interface RealAudioFixture {
  readonly formatId: AudioFormatId;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sha256: string;
  readonly expectedChromiumCanPlayType: CanPlayTypeResult;
  readonly expectedChromiumDecode: 'supported' | 'unsupported';
  readonly decodedDurationSeconds: {
    readonly minimum: number;
    readonly maximum: number;
  };
}

export interface MalformedAudioFixture {
  readonly formatId: AudioFormatId;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sha256: string;
}

export const REAL_AUDIO_FIXTURES = [
  {
    formatId: 'mp3',
    fileName: 'tone.mp3',
    mimeType: 'audio/mpeg',
    sha256: '04f45ebfe4dd14dc2aaadd928da44cf10a740d3be5bc6e4fd5d842d199d8eefd',
    expectedChromiumCanPlayType: 'probably',
    expectedChromiumDecode: 'supported',
    decodedDurationSeconds: { minimum: 0.99, maximum: 1.01 },
  },
  {
    formatId: 'wav',
    fileName: 'tone.wav',
    mimeType: 'audio/wav',
    sha256: '37e403a357ae11ede11c3144b5a41dedbd6e0213b62b05d6797f48c39f7d530b',
    expectedChromiumCanPlayType: 'maybe',
    expectedChromiumDecode: 'supported',
    decodedDurationSeconds: { minimum: 0.99, maximum: 1.01 },
  },
  {
    formatId: 'flac',
    fileName: 'tone.flac',
    mimeType: 'audio/flac',
    sha256: 'bfc667bdb0ba344e73b25f6136d97e20150ba5d858bfa58df8405097e2bd8fa7',
    expectedChromiumCanPlayType: 'probably',
    expectedChromiumDecode: 'supported',
    decodedDurationSeconds: { minimum: 0.99, maximum: 1.01 },
  },
  {
    formatId: 'aiff',
    fileName: 'tone.aiff',
    mimeType: 'audio/aiff',
    sha256: '8cdf21107c6c4472304ba700f1cfc49183b1cd8278f576772091ae3146dd66f3',
    expectedChromiumCanPlayType: '',
    expectedChromiumDecode: 'unsupported',
    decodedDurationSeconds: { minimum: 0, maximum: 0 },
  },
  {
    formatId: 'aac',
    fileName: 'tone.aac',
    mimeType: 'audio/aac',
    sha256: '68388780b887e8793bbad0968deab1b7bad30ad121e9596de65f3522177de699',
    expectedChromiumCanPlayType: 'probably',
    expectedChromiumDecode: 'supported',
    decodedDurationSeconds: { minimum: 1.04, maximum: 1.05 },
  },
  {
    formatId: 'm4a',
    fileName: 'tone.m4a',
    mimeType: 'audio/mp4',
    sha256: '5c5501794202876e06d700f5b2245f9d7b6da3b5859aaa543f2cb13e4484841a',
    expectedChromiumCanPlayType: 'maybe',
    expectedChromiumDecode: 'supported',
    decodedDurationSeconds: { minimum: 0.99, maximum: 1.01 },
  },
] as const satisfies readonly RealAudioFixture[];

export const MALFORMED_AUDIO_FIXTURES = [
  {
    formatId: 'mp3',
    fileName: 'truncated.mp3',
    mimeType: 'audio/mpeg',
    sha256: '8c13258e02aadcbebdbdbf2eb2d905ae52eef9bef640373243f43bd47638da2c',
  },
  {
    formatId: 'wav',
    fileName: 'truncated.wav',
    mimeType: 'audio/wav',
    sha256: 'e5a7a74aae36f859124c4762e652a28cc7f0a8c9e848199f7ce40fac8d9cf560',
  },
  {
    formatId: 'flac',
    fileName: 'truncated.flac',
    mimeType: 'audio/flac',
    sha256: 'e4ccad87546265c21d3897ab9d8d375c3117d43e90117173da637edda7a20138',
  },
  {
    formatId: 'aiff',
    fileName: 'truncated.aiff',
    mimeType: 'audio/aiff',
    sha256: '64ea7616ddc4c035dbb5294bcb6cd4a881a9b799190bf7713ac6455f76c9c64b',
  },
  {
    formatId: 'aac',
    fileName: 'truncated.aac',
    mimeType: 'audio/aac',
    sha256: '66a415668ae7e95689ec1d0f0083e09955d0f2e1160faa5f998243b6019a08ad',
  },
  {
    formatId: 'm4a',
    fileName: 'truncated.m4a',
    mimeType: 'audio/mp4',
    sha256: '4c7bed310ae799e7e56762b42625d302649ea7df193ca3636eeb26186d22d3a9',
  },
] as const satisfies readonly MalformedAudioFixture[];
