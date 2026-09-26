import type { CaptureInfo } from './types';

const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_GPS_LAT_REF = 0x0001;
const TAG_GPS_LAT = 0x0002;
const TAG_GPS_LON_REF = 0x0003;
const TAG_GPS_LON = 0x0004;

const TYPE_SIZES: Record<number, number> = {
  1: 1, // byte
  2: 1, // ascii
  3: 2, // short
  4: 4, // long
  5: 8, // rational
  7: 1, // undefined
  9: 4, // slong
  10: 8, // srational
};

class TiffReader {
  private readonly little: boolean;
  private readonly base: number;

  constructor(
    private readonly buf: Buffer,
    tiffOffset: number
  ) {
    if (tiffOffset + 8 > buf.length)
      throw new Error('tiff header out of range');
    const order = buf.toString('ascii', tiffOffset, tiffOffset + 2);
    this.little = order === 'II';
    if (!this.little && order !== 'MM') throw new Error('bad byte order');
    this.base = tiffOffset;
    if (this.u16(2) !== 42) throw new Error('bad tiff magic');
  }

  u16(off: number): number {
    return this.little
      ? this.buf.readUInt16LE(this.base + off)
      : this.buf.readUInt16BE(this.base + off);
  }

  u32(off: number): number {
    return this.little
      ? this.buf.readUInt32LE(this.base + off)
      : this.buf.readUInt32BE(this.base + off);
  }

  firstIfdOffset(): number {
    return this.u32(4);
  }

  /** Read one IFD into a tag → {type,count,valueOffset} map. */
  ifd(
    offset: number
  ): Map<number, { type: number; count: number; valueOffset: number }> {
    const entries = new Map<
      number,
      { type: number; count: number; valueOffset: number }
    >();
    const count = this.u16(offset);
    for (let i = 0; i < count; i++) {
      const entry = offset + 2 + i * 12;
      if (entry + 12 > this.buf.length - this.base) break;
      const tag = this.u16(entry);
      const type = this.u16(entry + 2);
      const num = this.u32(entry + 4);
      const size = (TYPE_SIZES[type] ?? 1) * num;
      // Values ≤4 bytes are stored inline in the entry itself.
      const valueOffset = size <= 4 ? entry + 8 : this.u32(entry + 8);
      entries.set(tag, { type, count: num, valueOffset });
    }
    return entries;
  }

  ascii(valueOffset: number, count: number): string {
    const end = Math.min(this.base + valueOffset + count, this.buf.length);
    return this.buf
      .toString('ascii', this.base + valueOffset, end)
      .replaceAll('\0', '')
      .trim();
  }

  rational(valueOffset: number, index: number): number {
    const off = valueOffset + index * 8;
    const num = this.u32(off);
    const den = this.u32(off + 4);
    return den === 0 ? 0 : num / den;
  }

  entryValue(entry: {
    type: number;
    count: number;
    valueOffset: number;
  }): string | number | null {
    if (entry.type === 2) return this.ascii(entry.valueOffset, entry.count);
    if (entry.type === 3) return this.u16(entry.valueOffset);
    if (entry.type === 4) return this.u32(entry.valueOffset);
    return null;
  }
}

function parseExifDate(raw: string): string | null {
  // EXIF format: "YYYY:MM:DD HH:MM:SS"
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(raw);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dmsToDecimal(dms: number, ref: string): number | null {
  if (!Number.isFinite(dms)) return null;
  const sign = ref === 'S' || ref === 'W' ? -1 : 1;
  return sign * dms;
}

/** Parse EXIF capture info from a JPEG buffer. Returns nulls when absent. */
export function extractExif(
  buffer: Buffer
): Omit<CaptureInfo, 'source'> | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8)
    return null;

  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    const segLen = buffer.readUInt16BE(offset + 2);
    if (
      marker === 0xe1 &&
      buffer.toString('ascii', offset + 4, offset + 10) === 'Exif\0\0'
    ) {
      return parseTiff(buffer, offset + 10);
    }
    offset += 2 + segLen;
  }
  return null;
}

function parseTiff(
  buffer: Buffer,
  tiffOffset: number
): Omit<CaptureInfo, 'source'> | null {
  try {
    const reader = new TiffReader(buffer, tiffOffset);
    const ifd0 = reader.ifd(reader.firstIfdOffset());

    const make = ifd0.get(TAG_MAKE);
    const model = ifd0.get(TAG_MODEL);
    const cameraModel =
      [make, model]
        .map(entry => {
          const value = entry ? reader.entryValue(entry) : null;
          return typeof value === 'string' ? value : null;
        })
        .filter((value): value is string => Boolean(value))
        .join(' ') || null;

    let capturedAt: string | null = null;
    const exifPtr = ifd0.get(TAG_EXIF_IFD);
    if (exifPtr) {
      const exifIfd = reader.ifd(reader.u32(exifPtr.valueOffset));
      const dto = exifIfd.get(TAG_DATETIME_ORIGINAL);
      if (dto) {
        const value = reader.entryValue(dto);
        if (typeof value === 'string') capturedAt = parseExifDate(value);
      }
    }

    let latitude: number | null = null;
    let longitude: number | null = null;
    const gpsPtr = ifd0.get(TAG_GPS_IFD);
    if (gpsPtr) {
      const gpsIfd = reader.ifd(reader.u32(gpsPtr.valueOffset));
      const latEntry = gpsIfd.get(TAG_GPS_LAT);
      const latRef = gpsIfd.get(TAG_GPS_LAT_REF);
      const lonEntry = gpsIfd.get(TAG_GPS_LON);
      const lonRef = gpsIfd.get(TAG_GPS_LON_REF);
      if (latEntry && latRef && lonEntry && lonRef) {
        const lat =
          reader.rational(latEntry.valueOffset, 0) +
          reader.rational(latEntry.valueOffset, 1) / 60 +
          reader.rational(latEntry.valueOffset, 2) / 3600;
        const lon =
          reader.rational(lonEntry.valueOffset, 0) +
          reader.rational(lonEntry.valueOffset, 1) / 60 +
          reader.rational(lonEntry.valueOffset, 2) / 3600;
        const latRefValue = reader.entryValue(latRef);
        const lonRefValue = reader.entryValue(lonRef);
        latitude = dmsToDecimal(
          lat,
          typeof latRefValue === 'string' ? latRefValue : ''
        );
        longitude = dmsToDecimal(
          lon,
          typeof lonRefValue === 'string' ? lonRefValue : ''
        );
      }
    }

    return { capturedAt, latitude, longitude, cameraModel };
  } catch {
    return null;
  }
}
