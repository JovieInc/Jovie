import { redirect } from 'next/navigation';

/** Stable dashboard lives at the sweep-published static HTML. */
export default function TasteInboxPage() {
  redirect('/taste-inbox/index.html');
}
