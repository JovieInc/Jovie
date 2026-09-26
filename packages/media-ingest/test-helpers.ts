/** Test fixtures: minimal EXIF JPEG and PCM WAV builders. */

export function buildJpeg(options: {
  dateTime?: string; // "YYYY:MM:DD HH:MM:SS"
  model?: string;
  lat?: [number, number, number];
  latRef?: string;
  lon?: [number, number, number];
  lonRef?: string;
}): Buffer {
  const model = options.model ?? 'iPhone 15 Pro';
  const dto = options.dateTime ?? '2026:09:20 21:34:00';
  const lat = options.lat ?? [34, 3, 8];
  const latRef = options.latRef ?? 'N';
  const lon = options.lon ?? [118, 14, 37];
  const lonRef = options.lonRef ?? 'W';

  const tiff = Buffer.alloc(512);
  tiff.write('II', 0);
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4); // IFD0 at offset 8

  const modelOff = 256;
  const dtoOff = 288;
  const latOff = 320;
  const lonOff = 344;
  const exifIfdOff = 96;
  const gpsIfdOff = 112;

  // IFD0: model, exif ptr, gps ptr
  tiff.writeUInt16LE(3, 8);
  let entry = 10;
  const writeEntry = (
    tag: number,
    type: number,
    count: number,
    value: number
  ) => {
    tiff.writeUInt16LE(tag, entry);
    tiff.writeUInt16LE(type, entry + 2);
    tiff.writeUInt32LE(count, entry + 4);
    tiff.writeUInt32LE(value, entry + 8);
    entry += 12;
  };
  writeEntry(0x0110, 2, model.length + 1, modelOff);
  writeEntry(0x8769, 4, 1, exifIfdOff);
  writeEntry(0x8825, 4, 1, gpsIfdOff);

  // Exif IFD: DateTimeOriginal
  tiff.writeUInt16LE(1, exifIfdOff);
  tiff.writeUInt16LE(0x9003, exifIfdOff + 2);
  tiff.writeUInt16LE(2, exifIfdOff + 4);
  tiff.writeUInt32LE(dto.length + 1, exifIfdOff + 6);
  tiff.writeUInt32LE(dtoOff, exifIfdOff + 10);

  // GPS IFD: latRef, lat, lonRef, lon
  tiff.writeUInt16LE(4, gpsIfdOff);
  entry = gpsIfdOff + 2;
  tiff.writeUInt16LE(1, entry);
  tiff.writeUInt16LE(2, entry + 2);
  tiff.writeUInt32LE(2, entry + 4);
  tiff.writeUInt8(latRef.charCodeAt(0), entry + 8);
  entry += 12;
  writeEntry(2, 5, 3, latOff);
  tiff.writeUInt16LE(3, entry);
  tiff.writeUInt16LE(2, entry + 2);
  tiff.writeUInt32LE(2, entry + 4);
  tiff.writeUInt8(lonRef.charCodeAt(0), entry + 8);
  entry += 12;
  writeEntry(4, 5, 3, lonOff);

  tiff.write(`${model}\0`, modelOff, 'ascii');
  tiff.write(`${dto}\0`, dtoOff, 'ascii');
  const writeDms = (off: number, dms: [number, number, number]) => {
    for (let i = 0; i < 3; i++) {
      tiff.writeUInt32LE(dms[i], off + i * 8);
      tiff.writeUInt32LE(1, off + i * 8 + 4);
    }
  };
  writeDms(latOff, lat);
  writeDms(lonOff, lon);

  const app1Len = 6 + tiff.length;
  const header = Buffer.alloc(4);
  header[0] = 0xff;
  header[1] = 0xe1;
  header.writeUInt16BE(app1Len, 2);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    header,
    Buffer.from('Exif\0\0', 'ascii'),
    tiff,
    Buffer.from([0xff, 0xd9]),
  ]);
}

export function buildWav(samples: Float32Array, sampleRate = 22050): Buffer {
  const dataLen = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataLen);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLen, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buffer;
}

/** Click train at a fixed BPM for tempo tests. */
export function clickTrack(
  bpm: number,
  seconds: number,
  sampleRate = 22050
): Float32Array {
  const total = Math.floor(seconds * sampleRate);
  const samples = new Float32Array(total);
  const interval = (60 / bpm) * sampleRate;
  for (let beat = 0; beat * interval < total; beat++) {
    const start = Math.floor(beat * interval);
    for (let i = 0; i < 300 && start + i < total; i++) {
      samples[start + i] = Math.sin((i / 300) * Math.PI * 20) * (1 - i / 300);
    }
  }
  return samples;
}

/** Steady chord at the given frequencies for key tests. */
export function chord(
  freqs: number[],
  seconds: number,
  sampleRate = 22050
): Float32Array {
  const total = Math.floor(seconds * sampleRate);
  const samples = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const t = i / sampleRate;
    let v = 0;
    for (const f of freqs) v += Math.sin(2 * Math.PI * f * t);
    samples[i] = v / freqs.length;
  }
  return samples;
}
