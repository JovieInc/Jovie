import {
  AGENT_DISCOVERY_HEADERS,
  AGENT_SKILLS,
} from '@/lib/agent-ready/discovery';

export const revalidate = false;
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return AGENT_SKILLS.map(skill => ({ name: skill.name }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const skill = AGENT_SKILLS.find(item => item.name === name);
  if (!skill) return new Response(null, { status: 404 });
  return new Response(skill.body, {
    headers: {
      ...AGENT_DISCOVERY_HEADERS,
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
}
