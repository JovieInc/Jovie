/**
 * Storybook stub for YouTubeEmbed: stories never load third-party content.
 *
 * React sets an iframe's src through setAttribute, so while a story runs an
 * iframe src on the youtube-nocookie embed origin becomes a same-document
 * srcdoc placeholder instead (the real address stays readable on
 * data-stubbed-src). `holdLoad` also swallows that frame's load event in the
 * capture phase, so the embed's own loading skeleton stays on screen.
 *
 * Use from a story's beforeEach; the returned cleanup restores both.
 */

const YOUTUBE_EMBED_PREFIX = 'https://www.youtube-nocookie.com/embed/';

const STUB_DOCUMENT =
  '<!doctype html><html lang="en"><title>Video stub</title><body style="margin:0;display:grid;place-items:center;height:100vh;background:#111;color:#fff;font:14px system-ui">Video preview</body></html>';

export function stubYouTubeEmbeds({
  holdLoad = false,
}: {
  readonly holdLoad?: boolean;
} = {}): () => void {
  const proto = HTMLIFrameElement.prototype;
  const own = Object.getOwnPropertyDescriptor(proto, 'setAttribute');
  proto.setAttribute = function setAttribute(name: string, value: string) {
    if (
      name.toLowerCase() === 'src' &&
      String(value).startsWith(YOUTUBE_EMBED_PREFIX)
    ) {
      this.dataset.stubbedSrc = String(value);
      Element.prototype.setAttribute.call(this, 'srcdoc', STUB_DOCUMENT);
      return;
    }
    Element.prototype.setAttribute.call(this, name, value);
  };

  const swallowLoad = (event: Event) => {
    if (
      event.target instanceof HTMLIFrameElement &&
      event.target.dataset.stubbedSrc
    ) {
      event.stopPropagation();
    }
  };
  if (holdLoad) document.addEventListener('load', swallowLoad, true);

  return () => {
    if (own) Object.defineProperty(proto, 'setAttribute', own);
    else Reflect.deleteProperty(proto, 'setAttribute');
    document.removeEventListener('load', swallowLoad, true);
  };
}
