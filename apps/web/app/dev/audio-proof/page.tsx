import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AudioProofClient } from './AudioProofClient';

export const dynamic = 'force-dynamic';

export default function AudioProofPage() {
  const fixture = readFileSync(
    resolve(process.cwd(), 'tests/fixtures/audio/long-vbr-tone.mp3')
  );

  return (
    <AudioProofClient
      audioSrc={`data:audio/mpeg;base64,${fixture.toString('base64')}`}
    />
  );
}
