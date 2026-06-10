import { cookies } from 'next/headers';
import { LIBRARY_SHARE_DROP_COOKIE } from './constants';

export async function hasLibraryShareDropAccess(
  token: string
): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(LIBRARY_SHARE_DROP_COOKIE)?.value === token;
}
