import { tool } from 'ai';
import { z } from 'zod';
import { chatToolSchema } from '@/lib/chat/strict-schema';
import { getPlanDisplayName } from '@/lib/entitlements/registry';
import {
  CHAT_SKILLS,
  type ChatSkillEntry,
  findChatSkill,
  loadChatSkillBody,
} from './registry';

/**
 * Loads one skill's steps by name. A `plan: pro` skill answers like a
 * plan-locked tool for artists without paid chat tools.
 */
export function createUseSkillTool(
  options: {
    readonly paidPlan?: boolean;
    readonly skills?: readonly ChatSkillEntry[];
    readonly loadBody?: (name: string) => Promise<string | null>;
  } = {}
) {
  const skills = options.skills ?? CHAT_SKILLS;
  const loadBody = options.loadBody ?? loadChatSkillBody;
  return tool({
    description:
      'Load the full steps of one Jovie skill before doing work it covers. The skills and when to use each are listed under Skills in your instructions.',
    inputSchema: chatToolSchema({
      name: z
        .string()
        .min(2)
        .max(80)
        .describe('The skill name, exactly as listed'),
    }),
    execute: async ({ name }) => {
      const skill = findChatSkill(name, skills);
      if (!skill) {
        return {
          success: false as const,
          error: `No skill named "${name}".`,
          available: skills.map(item => item.name),
        };
      }
      if (skill.paidOnly && !options.paidPlan) {
        const plan = getPlanDisplayName('pro');
        return {
          success: false as const,
          locked: true as const,
          reason: `The ${skill.name} skill requires the ${plan} plan.`,
          plan_required: plan,
        };
      }
      const steps = await loadBody(skill.name);
      if (!steps) {
        return {
          success: false as const,
          error: `The ${skill.name} skill could not be loaded right now.`,
          available: skills.map(item => item.name),
        };
      }
      return { success: true as const, name: skill.name, steps };
    },
  });
}

/** Files what Jovie can't do yet; the founder's requests go to Summer. */
export function createRequestCapabilityTool(params: {
  readonly clerkUserId: string;
  readonly founder: boolean;
  readonly conversationId: string | null;
}) {
  return tool({
    description:
      "File a request for something Jovie can't do yet (a missing tool, integration or skill), or a skill the artist just taught you. Tell the artist you can't do it yet first, then call this with what they asked for in their words and why it matters to them.",
    inputSchema: chatToolSchema({
      kind: z
        .enum(['capability', 'skill'])
        .describe(
          'capability for something missing, skill for a taught method'
        ),
      request: z
        .string()
        .min(10)
        .max(2000)
        .describe('What the artist asked for, in their words, and why'),
      skillDraft: z
        .string()
        .max(6000)
        .optional()
        .describe('For kind skill: the SKILL.md draft from capture-a-skill'),
    }),
    execute: async ({ kind, request, skillDraft }) => {
      const { submitCapabilityRequest } = await import(
        '@/lib/chat/capability-request'
      );
      return submitCapabilityRequest({
        clerkUserId: params.clerkUserId,
        founder: params.founder,
        conversationId: params.conversationId,
        kind,
        request,
        skillDraft,
      });
    },
  });
}
