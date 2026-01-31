export interface PhoneMockupLink {
  id: string;
  title: string;
  url: string;
  platform: string;
  isVisible: boolean;
}

export interface PhoneMockupPreviewProps
  extends Readonly<{
    readonly username: string;
    readonly avatarUrl?: string | null;
    readonly links: PhoneMockupLink[];
    readonly className?: string;
  }> {}
