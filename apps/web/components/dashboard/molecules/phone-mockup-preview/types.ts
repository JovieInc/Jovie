export interface PhoneMockupLink {
  id: string;
  title: string;
  url: string;
  platform: string;
  isVisible: boolean;
}

export interface PhoneMockupPreviewProps
  extends Readonly<{
    username: string;
    avatarUrl?: string | null;
    links: PhoneMockupLink[];
    className?: string;
  }> {}
