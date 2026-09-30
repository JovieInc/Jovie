import { expect, test } from './setup';

test.use({
  storageState: { cookies: [], origins: [] },
  reducedMotion: 'reduce',
});

// Text in the DOM does not prove that a sighted visitor can read it. Bind the
// shared heading owners to painted words, including narrow and zoom reflow.
for (const width of [320, 375, 390, 430, 720, 768, 1440]) {
  for (const route of ['/', '/artist-profiles']) {
    test(`${route} headings remain complete and balanced at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 720 ? 450 : 900 });
      await page.route('**/*', request => {
        if (['GET', 'HEAD', 'OPTIONS'].includes(request.request().method())) {
          return request.continue();
        }
        return request.fulfill({ status: 503, body: 'Read-only layout probe' });
      });
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => document.fonts.ready);
      const headings = page.locator(
        route === '/'
          ? '#homepage-section-presence-heading'
          : 'main h2.ap-shell-h2'
      );
      expect(await headings.count()).toBeGreaterThan(0);
      for (const heading of await headings.all()) {
        await heading.scrollIntoViewIfNeeded();
        const layout = await heading.evaluate(element => {
          const box = element.getBoundingClientRect();
          const lines: { top: number; words: string[] }[] = [];
          const hidden: string[] = [];
          const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT
          );
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            for (const match of (node.textContent ?? '').matchAll(/\S+/g)) {
              const range = document.createRange();
              range.setStart(node, match.index);
              range.setEnd(node, match.index + match[0].length);
              const rect = range.getClientRects()[0];
              if (!rect || rect.width === 0) {
                hidden.push(match[0]);
                continue;
              }
              if (
                rect.top + rect.height / 2 > box.bottom + 1 ||
                rect.left < box.left - 1 ||
                rect.right > box.right + 1
              ) {
                hidden.push(match[0]);
                continue;
              }
              let line = lines.find(
                value => Math.abs(value.top - rect.top) < 4
              );
              if (!line) {
                line = { top: rect.top, words: [] };
                lines.push(line);
              }
              line.words.push(match[0]);
            }
          }
          return { text: element.textContent, hidden, lines };
        });
        expect(layout.hidden, `${layout.text}: hidden words`).toEqual([]);
        if (layout.lines.length > 1) {
          expect(
            layout.lines.at(-1)?.words.length,
            `${layout.text}: final painted line`
          ).toBeGreaterThan(1);
        }
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true);
    });
  }
}
