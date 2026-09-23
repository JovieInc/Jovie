import { SKILL_REGISTRY } from '@/lib/agents/registry';
import { WHITE_SPACE_STYLE_PROMPT } from '@/lib/services/retouching/style-prompt';
import { SkillDocCard } from './SkillDocCard';

// Use the bundled prompt; runtime Markdown is excluded from Vercel uploads.
// style.test.ts verifies this value against the canonical document byte-for-byte.
const promptContentByPath: Record<string, string> = {
  'apps/web/lib/services/retouching/styles/white-space.md':
    WHITE_SPACE_STYLE_PROMPT,
};

export function AdminSystemMapSkillsTab() {
  const skills = Object.values(SKILL_REGISTRY);

  const skillsWithDocs = skills.map(skill => ({
    ...skill,
    promptContent:
      'promptPath' in skill && skill.promptPath
        ? (promptContentByPath[skill.promptPath] ?? null)
        : null,
  }));

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
