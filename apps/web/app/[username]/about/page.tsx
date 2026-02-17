import { redirect } from 'next/navigation';

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
}

export default async function AboutPage({ params }: Props) {
  const { username } = await params;
  redirect(`/${username}?mode=about`);
}
