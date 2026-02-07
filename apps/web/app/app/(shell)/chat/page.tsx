import { redirect } from 'next/navigation';

// eslint-disable-next-line @jovie/no-hardcoded-routes -- Legacy dashboard path for redirect
const PROFILE_ROUTE = '/app/dashboard/profile';

// TODO(chat-ux): This page redirects to profile, but the sidebar still shows "Chat"
// as a nav item (dashboard-nav/config.ts:90-95). Users who click "Chat" land on
// the profile page with no indication that chat lives inside the link input.
// Consider either:
//   A) Rendering the full JovieChat component here (components/jovie/JovieChat.tsx)
//      which already implements a ChatGPT-style interface with empty state + prompts
//   B) Removing the "Chat" nav item if chat should stay inline-only
// The JovieChat component is fully built but currently orphaned (never mounted).
export default function ChatPage() {
  redirect(PROFILE_ROUTE);
}
