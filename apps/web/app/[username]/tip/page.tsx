import { redirect } from 'next/navigation';

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
}

/** Legacy /tip route — permanently redirects to /pay */
export default async function TipRedirectPage({ params }: Readonly<Props>) {
  const { username } = await params;
  redirect(`/${username}/pay`);
}
