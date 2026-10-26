export const MAX_LINES: number;
export const VIEWPORTS: readonly { width: number; height: number }[];
export const HEADING_SELECTOR: string;
export interface MeasuredHeading {
  tag: string;
  text: string;
  height: number;
  lineHeight: number;
  lines: number;
}
export function linesFor(contentHeight: number, lineHeight: number): number;
export function overLimit<T extends { lines: number }>(measured: T[], max?: number): T[];
export function measureHeadings(
  page: { evaluate: (script: string) => Promise<unknown> },
  selector?: string
): Promise<MeasuredHeading[]>;
