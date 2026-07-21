import { expect, test, vi } from 'vitest';

// Capture every buffer handed to nativeImage.createFromBuffer so we can
// inspect the generated tray-icon PNGs without a real Electron runtime.
const createdPngBuffers: Buffer[] = [];

vi.mock('electron', () => ({
  Menu: { buildFromTemplate: vi.fn() },
  nativeImage: {
    createFromBuffer: vi.fn((buf: Buffer) => {
      createdPngBuffers.push(buf);
      return { setTemplateImage: vi.fn(), isEmpty: () => false };
    }),
  },
  Tray: class {
    setToolTip = vi.fn();
    setImage = vi.fn();
    setTitle = vi.fn();
    setContextMenu = vi.fn();
    isDestroyed = () => false;
    destroy = vi.fn();
  },
}));

const { MenuBarTray } = await import('../src/tray.ts');

function parseIhdr(png: Buffer) {
  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.subarray(0, 8).equals(PNG_SIG)).toBe(true);
  expect(png.readUInt32BE(8)).toBe(13); // IHDR length
  expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
  const ihdr = png.subarray(16, 29);
  return {
    width: ihdr.readUInt32BE(0),
    height: ihdr.readUInt32BE(4),
    bitDepth: ihdr[8],
    colorType: ihdr[9],
    compression: ihdr[10],
    filter: ihdr[11],
    interlace: ihdr[12],
  };
}

test('tray icon PNG IHDR compression/filter/interlace bytes are zeroed', () => {
  // Regression: buildCirclePng previously used Buffer.allocUnsafe(13) for the
  // IHDR data. Bytes 10-12 (compression, filter, interlace — all required to
  // be 0 in PNG) inherited pool garbage ~58% of the time under churn, making
  // nativeImage.createFromBuffer reject the PNG and the tray icon blank.
  // Buffer.alloc is deterministic, but fill the pool with garbage first to
  // prove the generated PNG no longer depends on residual memory.
  const poisoned: Buffer[] = [];
  for (let i = 0; i < 64; i++) {
    poisoned.push(Buffer.alloc(13, 0xff));
  }

  new MenuBarTray(() => {});

  expect(createdPngBuffers.length).toBeGreaterThan(0);
  for (const png of createdPngBuffers) {
    const ihdr = parseIhdr(png);
    expect(ihdr.width).toBe(44);
    expect(ihdr.height).toBe(44);
    expect(ihdr.bitDepth).toBe(8);
    expect(ihdr.colorType).toBe(6); // RGBA
    expect(ihdr.compression).toBe(0);
    expect(ihdr.filter).toBe(0);
    expect(ihdr.interlace).toBe(0);
  }
});
