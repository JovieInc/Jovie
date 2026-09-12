import { getProfile } from '../../lib/get-profile';

export async function generateMetadata() {
  return { title: getProfile() };
}
