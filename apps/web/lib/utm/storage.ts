/**
 * UTM Usage Storage
 *
 * LocalStorage-based persistence for UTM usage tracking.
 * This enables smart sorting based on user's frequently used presets.
 *
 * Privacy-first: All data is stored locally, never sent to server.
 */

import type { UTMUsageData, UTMUsageRecord } from './types';

// Storage key for UTM usage data
const STORAGE_KEY = 'jovie_utm_usage';

// Current schema version for migrations
const CURRENT_VERSION = 1;

// Maximum number of usage records to store
const MAX_RECORDS = 100;

// Maximum contexts to track per record
const MAX_CONTEXTS_PER_RECORD = 20;

/**
 * Get empty usage data structure
 */
function getEmptyUsageData(): UTMUsageData {
  return {
    version: CURRENT_VERSION,
    records: {},
    updatedAt: Date.now(),
  };
}

/**
 * Load usage data from localStorage
 */
export function loadUsageData(): UTMUsageData {
  if (typeof window === 'undefined') {
    return getEmptyUsageData();
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return getEmptyUsageData();
    }

    const data = JSON.parse(stored) as UTMUsageData;

    // Validate structure
    if (
      typeof data !== 'object' ||
      typeof data.version !== 'number' ||
      typeof data.records !== 'object'
    ) {
      console.warn('[UTM Storage] Invalid data structure, resetting');
      return getEmptyUsageData();
    }

    // Handle version migrations if needed
    if (data.version < CURRENT_VERSION) {
      return migrateUsageData(data);
    }

    return data;
  } catch (error) {
    console.warn('[UTM Storage] Failed to load usage data:', error);
    return getEmptyUsageData();
  }
}

/**
 * Save usage data to localStorage
 */
export function saveUsageData(data: UTMUsageData): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    // Prune old records if needed
    const prunedData = pruneUsageData(data);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(prunedData));
  } catch (error) {
    console.warn('[UTM Storage] Failed to save usage data:', error);
  }
}

/**
 * Record a preset usage
 */
export function recordPresetUsage(
  presetId: string,
  contextId?: string
): UTMUsageData {
  const data = loadUsageData();
  const now = Date.now();

  const existing = data.records[presetId];

  if (existing) {
    // Update existing record
    existing.count += 1;
    existing.lastUsed = now;

    // Add context if provided and not already tracked
    if (contextId && !existing.contexts.includes(contextId)) {
      existing.contexts = [contextId, ...existing.contexts].slice(
        0,
        MAX_CONTEXTS_PER_RECORD
      );
    }
  } else {
    // Create new record
    data.records[presetId] = {
      presetId,
      count: 1,
      lastUsed: now,
      contexts: contextId ? [contextId] : [],
    };
  }

  data.updatedAt = now;
  saveUsageData(data);

  return data;
}

/**
 * Get usage record for a preset
 */
export function getPresetUsage(presetId: string): UTMUsageRecord | undefined {
  const data = loadUsageData();
  return data.records[presetId];
}

/**
 * Get all usage records sorted by score
 */
export function getAllUsageRecords(): UTMUsageRecord[] {
  const data = loadUsageData();
  return Object.values(data.records).sort(
    (a, b) => calculateScore(b) - calculateScore(a)
  );
}

/**
 * Get recently used preset IDs (within last 24 hours)
 */
export function getRecentPresetIds(maxCount = 5): string[] {
  const data = loadUsageData();
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

  return Object.values(data.records)
    .filter(record => record.lastUsed >= oneDayAgo)
    .sort((a, b) => b.lastUsed - a.lastUsed)
    .slice(0, maxCount)
    .map(record => record.presetId);
}

/**
 * Get popular preset IDs (by usage score)
 */
export function getPopularPresetIds(maxCount = 5): string[] {
  const data = loadUsageData();

  return Object.values(data.records)
    .sort((a, b) => calculateScore(b) - calculateScore(a))
    .slice(0, maxCount)
    .map(record => record.presetId);
}

/**
 * Calculate usage score for a record
 * Higher score = more relevant (combination of frequency + recency)
 */
export function calculateScore(record: UTMUsageRecord): number {
  const recencyWeight = 0.4;
  const frequencyWeight = 0.6;

  // Recency: decay over 30 days
  const daysSinceUse = (Date.now() - record.lastUsed) / (1000 * 60 * 60 * 24);
  const recencyScore = Math.max(0, 1 - daysSinceUse / 30);

  // Frequency: logarithmic scale (diminishing returns)
  const frequencyScore = Math.min(1, Math.log10(record.count + 1) / 3);

  return recencyScore * recencyWeight + frequencyScore * frequencyWeight;
}

/**
 * Clear all usage data
 */
export function clearUsageData(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('[UTM Storage] Failed to clear usage data:', error);
  }
}

/**
 * Prune old records to keep storage size manageable
 */
function pruneUsageData(data: UTMUsageData): UTMUsageData {
  const records = Object.values(data.records);

  if (records.length <= MAX_RECORDS) {
    return data;
  }

  // Sort by score and keep top records
  const sortedRecords = records.sort(
    (a, b) => calculateScore(b) - calculateScore(a)
  );
  const keptRecords = sortedRecords.slice(0, MAX_RECORDS);

  return {
    ...data,
    records: Object.fromEntries(
      keptRecords.map(record => [record.presetId, record])
    ),
  };
}

/**
 * Migrate data from older versions
 */
function migrateUsageData(data: UTMUsageData): UTMUsageData {
  // Currently no migrations needed since we're at v1
  // Future migrations would go here
  return {
    ...data,
    version: CURRENT_VERSION,
  };
}
