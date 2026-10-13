export const dynamic = 'force-dynamic';

/**
 * OpenAI domain verification. The portal token is supplied at request time
 * via OPENAI_APPS_CHALLENGE. No token is stored in the repository.
 */
export function GET() {
  const token = process.env.OPENAI_APPS_CHALLENGE?.trim();
  if (!token) {
    return new Response(null, {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  return new Response(token, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
