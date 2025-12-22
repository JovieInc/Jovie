'use client';

import { useCallback, useEffect, useRef } from 'react';

export interface PollingTask {
  id: string;
  intervalMs: number;
  callback: () => void | Promise<void>;
  priority?: number; // Lower number = higher priority
  enabled?: boolean;
}

interface PollingCoordinatorState {
  tasks: Map<string, PollingTask>;
  intervals: Map<string, NodeJS.Timeout>;
  lastRun: Map<string, number>;
  staggerOffset: Map<string, number>;
}

/**
 * Hook to coordinate multiple polling intervals
 * Prevents simultaneous requests by staggering them
 * Pauses when tab is hidden
 * Uses exponential backoff for failed requests
 */
export function usePollingCoordinator() {
  const stateRef = useRef<PollingCoordinatorState>({
    tasks: new Map(),
    intervals: new Map(),
    lastRun: new Map(),
    staggerOffset: new Map(),
  });

  const registerTask = useCallback((task: PollingTask) => {
    const state = stateRef.current;

    // Calculate stagger offset based on priority and existing tasks
    if (!state.staggerOffset.has(task.id)) {
      const sortedTasks = Array.from(state.tasks.values())
        .filter(t => t.enabled !== false)
        .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

      const taskIndex = sortedTasks.findIndex(t => t.id === task.id);
      const staggerMs = taskIndex * 200; // 200ms stagger between tasks
      state.staggerOffset.set(task.id, staggerMs);
    }

    state.tasks.set(task.id, task);

    // Clear existing interval if any
    const existingInterval = state.intervals.get(task.id);
    if (existingInterval) {
      clearInterval(existingInterval);
      state.intervals.delete(task.id);
    }

    // Start new interval with stagger
    const stagger = state.staggerOffset.get(task.id) ?? 0;
    const runTask = async () => {
      // Skip if tab is hidden
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden'
      ) {
        return;
      }

      // Skip if task is disabled
      const currentTask = state.tasks.get(task.id);
      if (!currentTask || currentTask.enabled === false) {
        return;
      }

      try {
        await currentTask.callback();
        state.lastRun.set(task.id, Date.now());
      } catch (error) {
        console.error(`Polling task ${task.id} failed:`, error);
        // Exponential backoff on error
        const lastRun = state.lastRun.get(task.id) ?? 0;
        const timeSinceLastRun = Date.now() - lastRun;
        const backoffMs = Math.min(
          currentTask.intervalMs * 2,
          30000 // Max 30s backoff
        );

        if (timeSinceLastRun < backoffMs) {
          // Clear and restart with backoff
          const existing = state.intervals.get(task.id);
          if (existing) {
            clearInterval(existing);
          }
          setTimeout(() => {
            const newInterval = setInterval(runTask, currentTask.intervalMs);
            state.intervals.set(task.id, newInterval);
          }, backoffMs - timeSinceLastRun);
          return;
        }
      }
    };

    // Initial run after stagger
    const initialTimeout = setTimeout(() => {
      void runTask();
      const interval = setInterval(runTask, task.intervalMs);
      state.intervals.set(task.id, interval);
    }, stagger);

    return () => {
      clearTimeout(initialTimeout);
      const interval = state.intervals.get(task.id);
      if (interval) {
        clearInterval(interval);
        state.intervals.delete(task.id);
      }
    };
  }, []);

  const unregisterTask = useCallback((taskId: string) => {
    const state = stateRef.current;
    const interval = state.intervals.get(taskId);
    if (interval) {
      clearInterval(interval);
      state.intervals.delete(taskId);
    }
    state.tasks.delete(taskId);
    state.lastRun.delete(taskId);
    state.staggerOffset.delete(taskId);
  }, []);

  const updateTask = useCallback(
    (taskId: string, updates: Partial<PollingTask>) => {
      const state = stateRef.current;
      const existing = state.tasks.get(taskId);
      if (existing) {
        const updated = { ...existing, ...updates };
        state.tasks.set(taskId, updated);

        // Restart interval if intervalMs changed
        if (updates.intervalMs && updates.intervalMs !== existing.intervalMs) {
          unregisterTask(taskId);
          registerTask(updated);
        }
      }
    },
    [registerTask, unregisterTask]
  );

  // Pause all polling when tab is hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      // Intervals will check visibilityState themselves
      // This is just for cleanup if needed
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        document.removeEventListener(
          'visibilitychange',
          handleVisibilityChange
        );
      };
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    const state = stateRef.current;
    return () => {
      state.intervals.forEach(interval => clearInterval(interval));
      state.intervals.clear();
      state.tasks.clear();
      state.lastRun.clear();
      state.staggerOffset.clear();
    };
  }, []);

  return {
    registerTask,
    unregisterTask,
    updateTask,
  };
}
