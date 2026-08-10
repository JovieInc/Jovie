export interface BlogPostMetadata {
  title: string;
  date: string;
  updatedDate?: string;
  author: string;
  authorUsername?: string;
  authorTitle?: string;
  authorProfile?: string;
  category?: string;
  tags: string[];
  excerpt: string;
  readingTime: number;
  wordCount: number;
}

export interface BlogPostSummary extends BlogPostMetadata {
  slug: string;
}

export interface ResolvedAuthor {
  name: string;
  title?: string;
  avatarUrl: string | null;
  profileUrl?: string;
  isVerified: boolean;
  bio?: string;
  username?: string;
}
