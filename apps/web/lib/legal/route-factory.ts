import fs from 'fs/promises';
import { NextResponse } from 'next/server';
import path from 'path';
import { remark } from 'remark';
import html from 'remark-html';

/**
 * Creates a legal document route handler that converts markdown to HTML
 * @param docFilename - The markdown filename in the content/legal/ directory (e.g., 'terms.md')
 * @param errorMessage - Custom error message if document fails to load
 * @returns Next.js route handler function
 */
export function createLegalDocumentRoute(
  docFilename: string,
  errorMessage: string = 'Failed to load document.'
) {
  return async function GET() {
    try {
      const sanitizedFilename = path.basename(docFilename);
      if (sanitizedFilename !== docFilename) {
        throw new Error('Invalid document filename');
      }

      const legalDir = path.resolve(process.cwd(), 'content', 'legal');
      const filePath = path.resolve(legalDir, sanitizedFilename);
      const legalDirWithSep = legalDir.endsWith(path.sep)
        ? legalDir
        : `${legalDir}${path.sep}`;
      if (!filePath.startsWith(legalDirWithSep)) {
        throw new Error('Invalid document path');
      }

      const fileContents = await fs.readFile(filePath, 'utf8');

      const processedContent = await remark().use(html).process(fileContents);
      const contentHtml = processedContent.toString();

      return new NextResponse(contentHtml, {
        headers: {
          'Content-Type': 'text/html',
        },
      });
    } catch (error) {
      console.error(`Error loading ${docFilename}:`, error);
      return new NextResponse(`<p>${errorMessage}</p>`, {
        status: 500,
        headers: {
          'Content-Type': 'text/html',
        },
      });
    }
  };
}
