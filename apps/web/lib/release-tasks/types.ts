/**
 * Release task types for client-side use.
 * Mirrors the database schema types without importing from schema
 * (which triggers the server-only-imports ESLint rule in client components).
 */

export interface ReleaseTaskView {
  id: string;
  releaseId: string;
  creatorProfileId: string;
  templateItemId: string | null;
  title: string;
  description: string | null;
  explainerText: string | null;
  learnMoreUrl: string | null;
  videoUrl: string | null;
  category: string | null;
  status: 'backlog' | 'todo' | 'in_progress' | 'done' | 'cancelled';
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  position: number;
  assigneeType: 'human' | 'ai_workflow';
  assigneeUserId: string | null;
  aiWorkflowId: string | null;
  dueDaysOffset: number | null;
  dueDate: Date | null;
  completedAt: Date | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}
