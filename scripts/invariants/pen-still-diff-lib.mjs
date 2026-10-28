// biome-ignore-all format: compact invariant keeps this advisory diff inside the PR size guard.
// biome-ignore-all assist/source/organizeImports: compact invariant keeps imports together.
/** Pure Pen-still geometry, SSIM, and triptych helpers. No Playwright. Canvas #030406 is empty. */
import { crc32, deflateSync, inflateSync } from 'node:zlib'; export const PEN_STILL_TOLERANCES = Object.freeze({
sectionHeightRatio: 0.15, mockupAspect: 0.12, mockupArea: 0.2, textBlockY: 0.08, ssimMin: 0.82, });
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); function chunk(type, data) {
const name = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])) >>> 0);
return Buffer.concat([length, name, data, crc]); }
/** @param {{width: number, height: number, data: Uint8Array}} image */
export function encodePng(image) { const { width, height, data } = image;
if (data.length !== width * height * 4) throw new Error('PNG buffer does not match width and height');
const raw = Buffer.alloc((width * 4 + 1) * height); for (let y = 0; y < height; y++) {
const row = y * (width * 4 + 1); raw[row] = 0;
raw.set(data.subarray(y * width * 4, (y + 1) * width * 4), row + 1); } const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
} function paeth(a, b, c) { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b);
const pc = Math.abs(p - c); if (pa <= pb && pa <= pc) return a; if (pb <= pc) return b; return c; }
/** @param {Buffer | Uint8Array} input */
export function decodePng(input) { const png = Buffer.isBuffer(input) ? input : Buffer.from(input);
if (!png.subarray(0, 8).equals(SIG)) throw new Error('not a PNG'); let offset = 8; let width = 0;
let height = 0; let colorType = 6; const idat = []; while (offset < png.length) {
const length = png.readUInt32BE(offset); const type = png.toString('ascii', offset + 4, offset + 8);
const data = png.subarray(offset + 8, offset + 8 + length); offset += 12 + length; if (type === 'IHDR') {
width = data.readUInt32BE(0); height = data.readUInt32BE(4);
if (data[8] !== 8 || (data[9] !== 2 && data[9] !== 6) || data[12] !== 0) throw new Error('unsupported PNG');
colorType = data[9]; } else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break; }
const channels = colorType === 6 ? 4 : 3; const stride = width * channels;
const inflated = inflateSync(Buffer.concat(idat)); const dataOut = new Uint8Array(width * height * 4);
let src = 0;
/** @type {Uint8Array | null} */
let prev = null; for (let y = 0; y < height; y++) { const filter = inflated[src]; src += 1;
const row = inflated.subarray(src, src + stride); src += stride; const recon = new Uint8Array(stride);
for (let i = 0; i < stride; i++) { const left = i >= channels ? recon[i - channels] : 0;
const up = prev ? prev[i] : 0; const upLeft = prev && i >= channels ? prev[i - channels] : 0; const pred =
filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2)
: filter === 4 ? paeth(left, up, upLeft) : null;
if (pred === null) throw new Error(`unsupported PNG filter ${filter}`); recon[i] = (row[i] + pred) & 255; }
for (let x = 0; x < width; x++) { const s = x * channels; const d = (y * width + x) * 4; dataOut[d] = recon[s];
dataOut[d + 1] = recon[s + 1]; dataOut[d + 2] = recon[s + 2];
dataOut[d + 3] = channels === 4 ? recon[s + 3] : 255; } prev = recon; } return { width, height, data: dataOut };
}
/** @param {number} width @param {number} height @param {number[]} rgba */
export function solidImage(width, height, rgba) { const data = new Uint8Array(width * height * 4);
for (let i = 0; i < data.length; i += 4) data.set(rgba.length === 4 ? rgba : [...rgba, 255], i);
return { width, height, data }; }
/** @param {{width: number, height: number, data: Uint8Array}} image */
export function fillRect(image, x, y, w, h, rgba) { const color = rgba.length === 4 ? rgba : [...rgba, 255];
const x0 = Math.max(0, x); const y0 = Math.max(0, y); const x1 = Math.min(image.width, x + w);
const y1 = Math.min(image.height, y + h); for (let yy = y0; yy < y1; yy++) {
for (let xx = x0; xx < x1; xx++) image.data.set(color, (yy * image.width + xx) * 4); } return image; }
/** Area-average resize so SSIM compares equal dimensions. */
export function resizeImage(image, width, height) {
if (image.width === width && image.height === height) return image;
const data = new Uint8Array(width * height * 4); for (let y = 0; y < height; y++) {
const srcY0 = Math.floor((y * image.height) / height);
const srcY1 = Math.max(srcY0 + 1, Math.floor(((y + 1) * image.height) / height));
for (let x = 0; x < width; x++) { const srcX0 = Math.floor((x * image.width) / width);
const srcX1 = Math.max(srcX0 + 1, Math.floor(((x + 1) * image.width) / width));
let r = 0, g = 0, b = 0, a = 0, n = 0; for (let yy = srcY0; yy < srcY1; yy++) {
for (let xx = srcX0; xx < srcX1; xx++) { const i = (yy * image.width + xx) * 4; r += image.data[i];
g += image.data[i + 1]; b += image.data[i + 2]; a += image.data[i + 3]; n += 1; } }
const o = (y * width + x) * 4; data[o] = Math.round(r / n); data[o + 1] = Math.round(g / n);
data[o + 2] = Math.round(b / n); data[o + 3] = Math.round(a / n); } } return { width, height, data }; }
function luminance(data, i) { return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; }
/** Mean SSIM over non-overlapping 8×8 windows (smaller when the image is). */
export function ssim(left, right) {
if (left.width !== right.width || left.height !== right.height) throw new Error('SSIM images must be the same size');
const window = left.width >= 8 && left.height >= 8 ? 8 : Math.min(left.width, left.height);
const c1 = (0.01 * 255) ** 2; const c2 = (0.03 * 255) ** 2; let total = 0; let count = 0;
for (let y = 0; y + window <= left.height; y += window) {
for (let x = 0; x + window <= left.width; x += window) { let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
for (let yy = y; yy < y + window; yy++) { for (let xx = x; xx < x + window; xx++) {
const i = (yy * left.width + xx) * 4; const lx = luminance(left.data, i); const ly = luminance(right.data, i);
sx += lx; sy += ly; sxx += lx * lx; syy += ly * ly; sxy += lx * ly; n += 1; } } const mx = sx / n;
const my = sy / n; const vx = sxx / n - mx * mx; const vy = syy / n - my * my; const cov = sxy / n - mx * my;
total += ((2 * mx * my + c1) * (2 * cov + c2)) / ((mx * mx + my * my + c1) * (vx + vy + c2)); count += 1; } }
return count === 0 ? 0 : total / count; } function cornerBackground(image) {
const points = [0, (image.width - 1) * 4, (image.height - 1) * image.width * 4, ((image.height - 1) * image.width + image.width - 1) * 4];
const bg = [0, 0, 0]; for (const p of points) { bg[0] += image.data[p]; bg[1] += image.data[p + 1];
bg[2] += image.data[p + 2]; } return bg.map(v => v / points.length); }
function largestComponent(mask, width, height) { const seen = new Uint8Array(mask.length); let best = null;
for (let start = 0; start < mask.length; start++) { if (!mask[start] || seen[start]) continue;
const stack = [start]; seen[start] = 1; let minX = width, minY = height, maxX = 0, maxY = 0, count = 0;
while (stack.length) { const p = stack.pop(); const x = p % width; const y = (p - x) / width; count += 1;
if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
const next = [x > 0 ? p - 1 : -1, x + 1 < width ? p + 1 : -1, y > 0 ? p - width : -1, y + 1 < height ? p + width : -1];
for (const n of next) { if (n >= 0 && mask[n] && !seen[n]) { seen[n] = 1; stack.push(n); } } }
if (count >= 8 && (!best || count > best.count)) best = { minX, minY, maxX, maxY, count }; }
if (!best) return null;
return { x: best.minX, y: best.minY, w: best.maxX - best.minX + 1, h: best.maxY - best.minY + 1 }; }
function textBands(text, width, height) { const rows = []; for (let y = 0; y < height; y++) {
let minX = width, maxX = 0, count = 0; for (let x = 0; x < width; x++) { if (!text[y * width + x]) continue;
count += 1; if (x < minX) minX = x; if (x > maxX) maxX = x; } if (count >= 2) rows.push({ y, minX, maxX }); }
const groups = []; for (const row of rows) { const current = groups.at(-1);
if (!current || row.y - current.at(-1).y > 2) groups.push([row]); else current.push(row); }
return groups.map(group => { const minX = Math.min(...group.map(row => row.minX));
const maxX = Math.max(...group.map(row => row.maxX)); const y0 = group[0].y; const y1 = group.at(-1).y + 1;
return { x: minX / width, y: (y0 + y1) / 2 / height, width: (maxX - minX + 1) / width,
height: (y1 - y0) / height, }; }); }
/** Full-frame aspect, largest non-text filled region, and text-block centers. */
export function measureImage(image) { const bg = cornerBackground(image);
const mockup = new Uint8Array(image.width * image.height);
const text = new Uint8Array(image.width * image.height); for (let p = 0; p < image.width * image.height; p++) {
const i = p * 4;
const dist = Math.hypot(image.data[i] - bg[0], image.data[i + 1] - bg[1], image.data[i + 2] - bg[2]);
if (dist <= 18) continue; if (luminance(image.data, i) >= 190) text[p] = 1; else mockup[p] = 1; }
const box = largestComponent(mockup, image.width, image.height); return { width: image.width,
height: image.height, sectionAspect: image.height / image.width, mockup: box ? { x: box.x / image.width,
y: box.y / image.height, width: box.w / image.width, height: box.h / image.height, aspect: box.w / box.h,
area: (box.w * box.h) / (image.width * image.height), } : null,
textBlocks: textBands(text, image.width, image.height), }; }
/** DOM geometry normalized the same way as a pixel still. Mockup y is the top edge. */
export function measureGeometry(geometry) {
if (!geometry?.section?.width || !geometry.section.height) return null;
const { section, mockup, textBlocks } = geometry; return { width: section.width, height: section.height,
sectionAspect: section.height / section.width, mockup: mockup ? { x: mockup.x / section.width,
y: mockup.y / section.height, width: mockup.width / section.width, height: mockup.height / section.height,
aspect: mockup.height ? mockup.width / mockup.height : null,
area: (mockup.width * mockup.height) / (section.width * section.height), } : null,
textBlocks: (textBlocks ?? []).map(block => ({ x: block.x / section.width,
y: (block.y + block.height / 2) / section.height, width: block.width / section.width,
height: block.height / section.height, })), }; } function relativeError(left, right) {
return Math.abs(left - right) / Math.max(Math.abs(left), Math.abs(right), 1e-6); }
function pairTextBlocks(penBlocks, renderBlocks) { if (penBlocks.length !== renderBlocks.length) return 1;
const penSorted = [...penBlocks].sort((a, b) => a.y - b.y);
const renderSorted = [...renderBlocks].sort((a, b) => a.y - b.y);
return penSorted.reduce((max, block, i) => Math.max(max, Math.abs(block.y - renderSorted[i].y)), 0); }
export function judgePair(pen, render, ssimScore, tolerances = PEN_STILL_TOLERANCES) {
const sectionHeightRatio = render.sectionAspect / pen.sectionAspect;
const sectionPass = Math.abs(sectionHeightRatio - 1) <= tolerances.sectionHeightRatio;
let mockupAspectError = null; let mockupAreaError = null; let mockupPass = true;
if (pen.mockup && render.mockup && pen.mockup.aspect && render.mockup.aspect) {
mockupAspectError = relativeError(pen.mockup.aspect, render.mockup.aspect);
mockupAreaError = relativeError(pen.mockup.area, render.mockup.area);
mockupPass = mockupAspectError <= tolerances.mockupAspect && mockupAreaError <= tolerances.mockupArea;
} else if (Boolean(pen.mockup) !== Boolean(render.mockup)) mockupPass = false;
const textBlockYDelta = pairTextBlocks(pen.textBlocks, render.textBlocks);
const textPass = textBlockYDelta <= tolerances.textBlockY; const ssimPass = ssimScore >= tolerances.ssimMin;
return { sectionHeightRatio, sectionPass, mockupAspectError, mockupAreaError, mockupPass,
textBlockYDelta, textPass, ssim: ssimScore, ssimPass,
pass: sectionPass && mockupPass && textPass && ssimPass, tolerances, }; }
export function diffImage(pen, render) { const aligned = resizeImage(render, pen.width, pen.height);
const data = new Uint8Array(pen.data.length); for (let i = 0; i < data.length; i += 4) { const delta = Math.max(
Math.abs(pen.data[i] - aligned.data[i]), Math.abs(pen.data[i + 1] - aligned.data[i + 1]),
Math.abs(pen.data[i + 2] - aligned.data[i + 2]), ); if (delta < 12) { data[i] = Math.round(pen.data[i] * 0.35);
data[i + 1] = Math.round(pen.data[i + 1] * 0.35); data[i + 2] = Math.round(pen.data[i + 2] * 0.35); } else {
data[i] = 255; data[i + 1] = 48; data[i + 2] = 72; } data[i + 3] = 255; }
return { width: pen.width, height: pen.height, data }; } const FONT = {
P: [0b01110, 0b10001, 0b10001, 0b01110, 0b01000, 0b01000, 0b01000],
E: [0b11111, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000, 0b11111],
N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
R: [0b01110, 0b10001, 0b10001, 0b01110, 0b01010, 0b01001, 0b10001],
D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
F: [0b11111, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000, 0b10000], ' ': [0, 0, 0, 0, 0, 0, 0], };
function drawLabel(image, text, originX, originY) { let cursor = originX; for (const char of text) {
const glyph = FONT[char] ?? FONT[' ']; for (let row = 0; row < glyph.length; row++) {
for (let col = 0; col < 5; col++) { if ((glyph[row] & (1 << (4 - col))) === 0) continue; const x = cursor + col;
const y = originY + row; if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
image.data.set([245, 247, 251, 255], (y * image.width + x) * 4); } } cursor += 6; } }
/** Pen | render | diff. Panels keep the Pen still's pixel size. */
export function composeTriptych(pen, render, diff) { const header = 14; const gap = 8; const panelW = pen.width;
const panelH = pen.height; const width = panelW * 3 + gap * 2;
const image = solidImage(width, panelH + header, [3, 4, 6, 255]); const panels = [ [pen, 'PEN', 0],
[resizeImage(render, panelW, panelH), 'RENDER', panelW + gap],
[resizeImage(diff, panelW, panelH), 'DIFF', (panelW + gap) * 2], ];
for (const [panel, label, originX] of panels) { drawLabel(image, label, originX + 2, 3);
for (let y = 0; y < panelH; y++) {
image.data.set(panel.data.subarray(y * panelW * 4, (y + 1) * panelW * 4), ((y + header) * width + originX) * 4);
} } return image; }
/** Dark section and a slightly wider mockup, both inside tolerance. */
export function syntheticPair() { const canvas = [3, 4, 6, 255]; const card = [19, 20, 23, 255];
const ink = [245, 247, 251, 255]; const pen = solidImage(80, 60, canvas); fillRect(pen, 18, 16, 44, 28, card);
fillRect(pen, 20, 8, 28, 3, ink); fillRect(pen, 20, 48, 22, 3, ink); const render = solidImage(80, 60, canvas);
fillRect(render, 16, 16, 48, 28, card); fillRect(render, 20, 9, 28, 3, ink);
fillRect(render, 20, 49, 22, 3, ink); return { pen, render }; } export function stretchedPair() {
const { pen } = syntheticPair(); return { pen, render: resizeImage(pen, pen.width, pen.height * 2) }; }
