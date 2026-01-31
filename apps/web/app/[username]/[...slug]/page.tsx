import { redirect } from 'next/navigation';

interface Props {
  readonly params: Promise<{
    readonly username: string;
    readonly slug: string[];
  }>;
}

export default async function CatchAllPage({ params }: Props) {
  const { username } = await params;
  // Redirect unknown paths to the main profile
  redirect(`/${username}`);
}
