import { hideSync } from '../../../workers/desktop-hidden-spawn';

export async function bootDesktop() {
  return hideSync();
}
