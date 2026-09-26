import { BASE_URL } from '@/constants/app';
import { ABUSE_EMAIL, SECURITY_EMAIL } from '@/constants/domains';

/** security.txt — RFC 9116 contact file for vulnerability/abuse intake. */

export const revalidate = false;
export const dynamic = 'force-static';

// RFC 9116 requires a future Expires field. Renew with each annual review.
const SECURITY_TXT_EXPIRES = '2027-09-30T00:00:00.000Z';

export function GET() {
  const content = `# Jovie security policy
# See https://securitytxt.org/ (RFC 9116)

Contact: mailto:${SECURITY_EMAIL}
Contact: mailto:${ABUSE_EMAIL}
Contact: ${BASE_URL}/report
Expires: ${SECURITY_TXT_EXPIRES}
Preferred-Languages: en
Canonical: ${BASE_URL}/.well-known/security.txt
Policy: ${BASE_URL}/legal/terms
`;

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
