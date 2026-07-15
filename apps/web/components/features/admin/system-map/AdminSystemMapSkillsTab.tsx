import { promises as fs } from 'node:fs';
import path from 'node:path';
import { SKILL_REGISTRY } from '@/lib/agents/registry';
import { SkillDocCard } from './SkillDocCard';

const promptReaders: Record<string, () => Promise<string>> = {
  'apps/web/lib/services/retouching/styles/white-space.md': () =>
    fs.readFile(
      path.join(
        process.cwd(),
        'lib',
        'services',
        'retouching',
        'styles',
        'white-space.md'
      ),
      'utf-8'
    ),
};

async function readPromptContent(
  promptPath: string | undefined
): Promise<string | null> {
  if (!promptPath) return null;
  try {
    return (await promptReaders[promptPath]?.()) ?? null;
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
