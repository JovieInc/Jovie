// Vite does not replace Next server actions with RPC references.
import type { DspPresenceData } from '@/app/app/(shell)/dashboard/presence/actions';

export async function loadDspPresenceForProfile(): Promise<DspPresenceData> {
  return { items: [], confirmedCount: 0, suggestedCount: 0 };
}

async function unavailableInStorybook(): Promise<never> {
  throw new Error('Configure a fixture for this dashboard action in Storybook');
}

export {
  unavailableInStorybook as addManualDspMatch,
  unavailableInStorybook as bulkUpdateTasks,
  unavailableInStorybook as confirmEvent,
  unavailableInStorybook as createTask,
  unavailableInStorybook as deleteContact,
  unavailableInStorybook as deleteTask,
  unavailableInStorybook as getTask,
  unavailableInStorybook as getTaskBoard,
  unavailableInStorybook as getTaskStats,
  unavailableInStorybook as getTasks,
  unavailableInStorybook as moveTask,
  unavailableInStorybook as rejectEvent,
  unavailableInStorybook as saveContact,
  unavailableInStorybook as undoRejectEvent,
  unavailableInStorybook as updateTask,
};
