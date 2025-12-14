export interface TocEntry {
  id: string;
  title: string;
  level: number;
}

export interface MarkdownDocument {
  html: string;
  toc: TocEntry[];
}
