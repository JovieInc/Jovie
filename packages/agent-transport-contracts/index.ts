import { createPrivateKey, sign as nodeSign } from 'node:crypto';

const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function signSummerBottleneckSnapshot<T extends Readonly<object>>(
  snapshot: T,
  privateKeyRaw: string | undefined,
  keyId: string | undefined
) {
  if (!privateKeyRaw || !keyId || !KEY_ID.test(keyId)) return null;

  try {
    const privateKey = createPrivateKey(
      privateKeyRaw.includes('\\n')
        ? privateKeyRaw.replaceAll('\\n', '\n')
        : privateKeyRaw
    );
    if (privateKey.asymmetricKeyType !== 'ed25519') return null;
    const signature = nodeSign(
      null,
      Buffer.from(
        `jovie.eve.summer-bottleneck-snapshot/v1\0${canonical(snapshot)}`
      ),
      privateKey
    ).toString('base64url');
    return {
      ...snapshot,
      producerAttestation: {
        algorithm: 'Ed25519' as const,
        keyId,
        signature,
      },
    };
  } catch {
    return null;
  }
}
