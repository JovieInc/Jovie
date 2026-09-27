# lib/queries

TanStack Query hooks for every client-side data flow in the app. ~100 hooks plus shared infrastructure for keys, cache strategies, and prefetching.

## Layout

Each hook is its own file. Naming convention:

- `use<Domain><Type>Query.ts` — read hooks (e.g. `useReleasesQuery`, `useBillingStatusQuery`)
- `use<Domain>Mutations.ts` — write hooks bundled per domain (e.g. `useReleaseMutations`)
- `use<Domain>Mutation.ts` — single-purpose mutation (e.g. `useAvatarUploadMutation`)

Supporting files:

- **`keys.ts`** — hierarchical query-key factory. Single source of truth.
- **`cache-strategies.ts`** — named presets (`REALTIME_CACHE`, `FREQUENT_CACHE`, `STANDARD_CACHE`, etc.)
- **`fetch.ts`** — edge-safe fetch helpers + `createQueryFn()`
- **`mutation-utils.ts`** — toast/error patterns shared across mutations
- **`server.ts`** — SSR prefetch helpers
- **`prefetch-dashboard.ts`** — dashboard route prefetch bundle
- **`HydrateClient.tsx` / `QueryErrorBoundary.tsx`** — provider components
- **`admin-infinite.ts` / `audience-infinite.ts`** — infinite-query primitives

## Categories

- **Profile / auth** — `useDashboardProfileQuery`, `usePublicProfileQuery`, `useAccountMutations`, `useAvatarUploadMutation`
- **Billing** — `useBillingStatusQuery`, `useBillingHistoryQuery`, `useBillingMutations`, `usePlanGate`
- **Releases** — `useDspMatchesQuery`, `useDspPresenceQuery`, `useArtworkDownloadMutation`, `useArtistThemeMutation`
- **Chat** — `useChatConversationsQuery`, `useChatConversationQuery`, `useChatMutations`, `useChatUsageQuery`, `useConfirmChat*Mutation`
- **Admin** — `useAdminBulkRefreshMutation`, `useAdminFeedbackMutation`, `useAdminLeadsPrimitives`, `useAdminSocialLinksQuery`, `audience-infinite.ts`
- **DSP / enrichment** — `useDspEnrichmentMutations`, `useDspEnrichmentStatusQuery`, `useArtistSearchQuery`, `useAppleMusicArtistSearchQuery`
- **Activity / health** — `useActivityFeedQuery`, `useAlgorithmHealthQuery`, `useEnvHealthQuery`, `useBuildInfoQuery`
- **Audience / earnings / contacts** — `useEarningsQuery`, `useContactsQuery`, `useCampaignInvites`

## Query-key conventions

All keys come from the `queryKeys` factory in `keys.ts`:

```ts
queryKeys.billing.status();              // ['billing', 'status']
queryKeys.releases.matrix(profileId);    // ['releases', 'matrix', profileId]
queryKeys.admin.leads.list(filters);     // ['admin', 'leads', 'list', filters]
```

Hierarchical keys allow scoped invalidation: `queryClient.invalidateQueries({ queryKey: queryKeys.billing.all })` clears every billing-related cache without listing each one.

## Cache invalidation

Two layers:

1. **Client mutations** — invalidate inside `onSuccess` using `queryClient.invalidateQueries({ queryKey: ... })`.
2. **Server actions / route handlers** — call helpers in `lib/cache/profile.ts` (`invalidateProfileCache`, `invalidateSocialLinksCache`, `invalidateAvatarCache`) so Next.js's data cache is purged for SSR profile pages.

## Adding a hook

1. Create the file (`useFooQuery.ts` or `useFooMutations.ts`).
2. Add the key to `keys.ts` if the domain is new.
3. Pick a strategy from `cache-strategies.ts`.
4. For mutations: call `queryClient.invalidateQueries()` in `onSuccess` with the right `queryKeys.*` scope.
5. If the data also lives in Next.js data cache (public profiles, etc.), add or call a helper in `lib/cache/`.
6. Export from `index.ts`.

Canonical, compiled examples live in [`examples.ts`](./examples.ts) and are
exercised by `examples.test.ts`. Copy from there rather than inventing new
wiring — it covers parameterized reads, paginated reads
(`infiniteQueryOptions`), search+pacing, mutations with invalidation, and
autosave-scoped invalidation. SSR hydration uses `HydrateClient.tsx` +
`server.ts` prefetch helpers; error boundaries use `QueryErrorBoundary.tsx`.

Key contract points the fixtures demonstrate:

- Bind the resource id into **both** the request URL and the query key.
- `queryFn` receives `({ signal })` — forward it so cancellation works.
  `createQueryFn(url)` results are queryFns themselves (`queryFn: fetchFoo`),
  not functions you call with `{ id }`.
- Pass a `schema` decoder at the fetch boundary for validated responses.
- Mutations invalidate the matching `queryKeys.*` scope in `onSuccess`;
  autosave scopes invalidation to the entity it writes.
