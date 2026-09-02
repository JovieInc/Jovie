import 'server-only';

import { issueSignedToken } from '@vercel/blob';

export async function issueBlobPutUploadToken(params: {
  readonly pathname: string;
  readonly allowedContentTypes: readonly string[];
  readonly maximumSizeInBytes: number;
}) {
  const allowedContentTypes = [...params.allowedContentTypes];
  const token = await issueSignedToken({
    pathname: params.pathname,
    operations: ['put'],
    allowedContentTypes,
    maximumSizeInBytes: params.maximumSizeInBytes,
  });

  return {
    token,
    urlOptions: {
      allowedContentTypes,
      maximumSizeInBytes: params.maximumSizeInBytes,
    },
  };
}
