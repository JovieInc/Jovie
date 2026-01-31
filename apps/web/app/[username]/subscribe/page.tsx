import { redirect } from 'next/navigation';

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
}

export default async function SubscribePage({ params }: Props) {
  const { username } = await params;
  // Redirect to profile with notifications/subscribe mode
  redirect(`/${username}?mode=subscribe`);
}
