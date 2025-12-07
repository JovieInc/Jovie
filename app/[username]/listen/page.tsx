import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{
    username: string;
  }>;
}

export default async function ListenPage({ params }: Props) {
  const { username } = await params;
  redirect(`/${username}?mode=listen`);
}
