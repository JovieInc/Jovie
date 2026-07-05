import { promises as fs } from 'node:fs';
import path from 'node:path';
import { SKILL_REGISTRY } from '@/lib/agents/registry';
import { SkillDocCard } from './SkillDocCard';

async function readPromptContent(
  promptPath: string | undefined
): Promise<string | null> {
  if (!promptPath) return null;
  try {
    // promptPath is relative to the repo root; Next.js cwd is the app dir
    const repoRoot = path.resolve(process.cwd(), '../..');
    const fullPath = path.join(repoRoot, promptPath);
    return await fs.readFile(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

export async function AdminSystemMapSkillsTab() {
  const skills = Object.values(SKILL_REGISTRY);

  const skillsWithDocs = await Promise.all(
    skills.map(async skill => ({
      ...skill,
      promptContent: await readPromptContent(
        'promptPath' in skill ? skill.promptPath : undefined
      ),
    }))
  );

  return (
    <div data-testid='system-map-skills' className='space-y-3'>
      <p className='text-xs text-secondary-token'>
        {skills.length} skill{skills.length !== 1 ? 's' : ''} registered in
        SKILL_REGISTRY. Click a skill to expand its prompt doc.
      </p>
      {skillsWithDocs.map(skill => (
        <SkillDocCard
          key={skill.id}
          id={skill.id}
          name={skill.name}
          description={skill.description}
          kind={skill.kind}
          model={skill.model}
          version={skill.version}
          promptContent={skill.promptContent}
        />
      ))}
    </div>
  );
}
