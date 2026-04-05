import { redirect } from 'next/navigation';

const CHAT_ROUTE = '/app/chat';

interface OldChatPageProps {
  readonly searchParams?: Promise<
    Record<string, string | string[] | undefined>
  >;
}

// Legacy /app/dashboard/chat path redirects to the new chat page
export default async function OldChatPage({ searchParams }: OldChatPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        query.append(key, item);
      }
      continue;
    }
    query.set(key, value);
  }

  const queryString = query.toString();
  redirect(queryString ? `${CHAT_ROUTE}?${queryString}` : CHAT_ROUTE);
}
