import type { DetectedLink } from '@/lib/utils/platform-detection';

export interface LinkItem extends DetectedLink {
  id: string;
  title: string;
  isVisible: boolean;
  order: number;
}
