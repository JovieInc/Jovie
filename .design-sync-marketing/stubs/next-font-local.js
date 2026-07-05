// design-sync stub: replaces next/font/local with a noop for browser bundles.
// next/font/local loads fonts at build time in the Next.js compile phase; it
// cannot run in Claude Design's browser sandbox. Fonts are instead provided by
// .design-sync-marketing/fonts.css (copies from .design-sync/fonts.css) which
// ships @font-face rules for Inter and Satoshi from the repo's public/fonts/.
//
// Returns the same shape that next/font produces so components using the result
// (e.g. `const inter = localFont({...}); <body className={inter.className}>`)
// get a stable empty className and variable rather than a thrown error.

export default function localFont(_config) {
  return {
    className: '',
    variable: '',
    style: { fontFamily: 'inherit', fontStyle: 'normal', fontWeight: 400 },
  };
}

// Named re-export mirrors the next/font/local package exports shape.
export { localFont };
