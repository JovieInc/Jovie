export interface BlogPostMetadata {
  title: string;
  /** Meta description override; falls back to the excerpt. */
  description?: string;
  /** Answer articles: the question the post answers (FAQPage JSON-LD). */
  question?: string;
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
