'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

export interface AdminLeadKeyword {
  id: string;
  query: string;
  enabled: boolean;
  resultsFoundTotal: number;
  lastUsedAt: string | null;
}

export interface LeadPipelineSettings {
  enabled: boolean;
  discoveryEnabled: boolean;
  autoIngestEnabled: boolean;
  autoIngestMinFitScore: number;
  dailyQueryBudget: number;
  queriesUsedToday: number;
}

export interface AdminLead {
  id: string;
  linktreeHandle: string;
  linktreeUrl: string;
  displayName: string | null;
  status: string;
  fitScore: number | null;
  hasPaidTier: boolean | null;
  hasSpotifyLink: boolean;
  hasInstagram: boolean;
  musicToolsDetected: string[];
  contactEmail: string | null;
  createdAt: string;
}

interface ErrorResponse {
  error?: string;
}

async function parseJsonWithError<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => ({}))) as T & ErrorResponse;
  if (!response.ok) {
    throw new Error(json.error ?? 'Request failed');
  }
  return json;
}

export function useLeadKeywordsQuery() {
  return useQuery({
    queryKey: queryKeys.admin.leads.keywords(),
    queryFn: async ({ signal }) => {
      const response = await fetchWithTimeout('/api/admin/leads/keywords', {
        cache: 'no-store',
        signal,
      });
      return response as { keywords: AdminLeadKeyword[] };
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}

export function useLeadPipelineSettingsQuery() {
  return useQuery({
    queryKey: queryKeys.admin.leads.settings(),
    queryFn: async ({ signal }) => {
      const response = await fetchWithTimeout('/api/admin/leads/settings', {
        cache: 'no-store',
        signal,
      });
      return response as { settings: LeadPipelineSettings };
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}

export function useAddLeadKeywordsMutation() {
  return useMutation({
    mutationFn: async (queries: string[]) => {
      const response = await fetchWithTimeout('/api/admin/leads/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries }),
      });
      return response as { count: number };
    },
  });
}

export function useSeedLeadKeywordsMutation() {
  return useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admin/leads/seed', { method: 'POST' });
      return parseJsonWithError<{
        result: { inserted: number; skipped: number };
      }>(response);
    },
  });
}

export function useToggleLeadKeywordMutation() {
  return useMutation({
    mutationFn: async (payload: { id: string; enabled: boolean }) => {
      const response = await fetch('/api/admin/leads/keywords', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return parseJsonWithError<AdminLeadKeyword>(response);
    },
  });
}

export function useDeleteLeadKeywordMutation() {
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch('/api/admin/leads/keywords', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      return parseJsonWithError<{ id: string }>(response);
    },
  });
}

export function useUpdateLeadPipelineSettingsMutation() {
  return useMutation({
    mutationFn: async (payload: LeadPipelineSettings) => {
      const response = await fetchWithTimeout('/api/admin/leads/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return response as { settings: LeadPipelineSettings };
    },
  });
}

export interface DiscoveryKeywordDiagnostic {
  keywordId: string;
  query: string;
  rawResultCount: number;
  linktreeUrlsFound: number;
  newLeadsInserted: number;
  duplicatesSkipped: number;
  error: string | null;
  durationMs: number;
  searchOffset: number;
}

export interface DiscoveryResultResponse {
  queriesUsed: number;
  candidatesProcessed: number;
  newLeadsFound: number;
  duplicatesSkipped: number;
  diagnostics: DiscoveryKeywordDiagnostic[];
  budgetRemaining: number;
  keywordRotationIndex: number;
  totalEnabledKeywords: number;
}

export function useRunLeadDiscoveryMutation() {
  return useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admin/leads/discover', {
        method: 'POST',
      });
      return parseJsonWithError<{
        result: DiscoveryResultResponse;
      }>(response);
    },
  });
}

export function useRunLeadQualificationMutation() {
  return useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admin/leads/qualify', {
        method: 'POST',
      });
      return parseJsonWithError<{ message: string }>(response);
    },
  });
}

export function useUpdateLeadStatusMutation() {
  return useMutation({
    mutationFn: async (payload: {
      id: string;
      status: 'approved' | 'rejected';
    }) => {
      const response = await fetch(`/api/admin/leads/${payload.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: payload.status }),
      });
      return parseJsonWithError<
        AdminLead & {
          ingestion?: {
            success: boolean;
            profileUsername?: string;
            error?: string;
          } | null;
        }
      >(response);
    },
  });
}

export function useQueueLeadUrlsMutation() {
  return useMutation({
    mutationFn: async (urls: string[]) => {
      const response = await fetch('/api/admin/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });
      return parseJsonWithError<{
        summary: { created: number; duplicate: number; invalid: number };
      }>(response);
    },
  });
}

export function useMarkLeadDmSentMutation() {
  return useMutation({
    mutationFn: async (leadId: string) => {
      const response = await fetch(`/api/admin/leads/${leadId}/dm-sent`, {
        method: 'PATCH',
      });
      return parseJsonWithError<{ id: string }>(response);
    },
  });
}
