// Mock for next/server in Storybook. The real entry drags in compiled
// ua-parser-js (needs __dirname) and crashes the browser story build.
// Stories never execute these — they only need the names to link.

export class NextResponse extends Response {
  static json(body, init) {
    return new NextResponse(JSON.stringify(body), init);
  }
  static redirect(url, init) {
    return new NextResponse(null, {
      ...init,
      status: 307,
      headers: { Location: String(url) },
    });
  }
  static next() {
    return new NextResponse(null);
  }
  static rewrite() {
    return new NextResponse(null);
  }
}

export class NextRequest extends Request {}

export class NextFetchEvent {}

export function userAgent() {
  return { isBot: false, ua: 'storybook-mock' };
}

export function after() {}

export const connection = async () => {};

export default { NextResponse, NextRequest, userAgent, after };
