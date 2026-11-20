/**
 * One store graphic as a self-contained HTML document (render stage).
 * Extracted from app-store-graphics.mjs: size-500 is shrink-only, so the
 * render-stage markup lives in its own module and the capture stage keeps
 * the budget room it needs.
 */

function escapeHtml(text) {
  return text.replace(
    /[&<>"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );
}

/**
 * One store graphic as a self-contained HTML document. One key light from
 * the upper left sets the single-hue glow, the bezel highlight and the
 * shadow, and the device bleeds off the bottom edge at the same position on
 * every panel so the set reads as one strip.
 */
export function renderHtml({
  spec,
  screen,
  colorSot,
  captureDataUri,
  fontDataUri,
  screenFill = '#000',
}) {
  const { width, height } = spec.device;
  const layout = spec.layout;
  const canvas = colorSot.elevations.dark[layout.canvas];
  const card = colorSot.elevations.dark.card;
  const floating = colorSot.elevations.dark.floating;
  const accent = colorSot.accents.hex[screen.accent];
  const screenWidth = layout.deviceWidth - layout.bezel * 2;
  const screenHeight = Math.round((screenWidth * height) / width);
  // The status bar and app header stay put; only the content below scrolls.
  const pinned = Math.round(layout.pinnedHeader * screenHeight);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Satoshi;src:url(${fontDataUri}) format("woff2");font-weight:300 900}
*{box-sizing:border-box;margin:0}
html,body{width:${width}px;height:${height}px;overflow:hidden;background:${canvas}}
.stage{position:relative;width:100%;height:100%;overflow:hidden;
background:
radial-gradient(ellipse 120% 70% at 12% 8%,
color-mix(in oklch,${accent} 58%,${canvas}) 0%,
color-mix(in oklch,${accent} 24%,${canvas}) 38%,transparent 72%),
radial-gradient(ellipse 80% 45% at 60% 78%,
color-mix(in oklch,${accent} 18%,${canvas}) 0%,transparent 70%),${canvas}}
h1{position:absolute;top:${layout.headlineTop}px;left:${layout.marginX}px;
width:${width - layout.marginX * 2}px;color:#fff;white-space:pre-line;
font:700 ${layout.headlineSize}px/1.02 Satoshi,Inter,system-ui,sans-serif;
letter-spacing:-0.035em}
.device{position:absolute;top:${layout.deviceTop}px;left:50%;transform:translateX(-50%);
width:${layout.deviceWidth}px;padding:${layout.bezel}px;border:2px solid transparent;
border-radius:${layout.deviceRadius}px;
background:linear-gradient(${card},${card}) padding-box,
linear-gradient(135deg,rgb(255 255 255 / .34),${floating} 32%,${floating} 70%,rgb(0 0 0 / .4)) border-box;
box-shadow:40px 72px 160px rgb(0 0 0 / .62),12px 20px 48px rgb(0 0 0 / .4)}
.screen{position:relative;width:${screenWidth}px;height:${screenHeight}px;overflow:hidden;
background:${screenFill};border-radius:${layout.deviceRadius - layout.bezel}px}
.screen img{display:block;width:${screenWidth}px;height:${screenHeight}px}
.pinned{position:absolute;inset:0 0 auto;height:${pinned}px;overflow:hidden}
.content{position:absolute;inset:${pinned}px 0 0;overflow:hidden}
.content img{margin-top:${-pinned - Math.round((screen.scroll ?? 0) * screenHeight)}px}
</style></head><body><div class="stage" data-screen="${screen.id}">
<h1>${escapeHtml(screen.headline)}</h1>
<div class="device"><div class="screen">
<div class="pinned"><img alt="" src="${captureDataUri}"></div>
<div class="content"><img alt="" src="${captureDataUri}"></div>
</div></div>
</div></body></html>`;
}
