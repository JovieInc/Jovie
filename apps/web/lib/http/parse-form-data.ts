export class FormDataParseError extends TypeError {
  constructor(cause: unknown) {
    super('Invalid form data in request body', { cause });
    this.name = 'FormDataParseError';
  }
}

export function isFormDataParseError(
  error: unknown
): error is FormDataParseError {
  return error instanceof FormDataParseError;
}

function isFormDataContentType(contentType: string | null): boolean {
  const normalized = contentType?.toLowerCase() ?? '';
  return (
    normalized.includes('multipart/form-data') ||
    normalized.includes('application/x-www-form-urlencoded')
  );
}

export async function parseFormDataBody(request: Request): Promise<FormData> {
  const bodyWasUsed = request.bodyUsed;
  try {
    return await request.formData();
  } catch (error) {
    if (
      error instanceof TypeError &&
      !bodyWasUsed &&
      isFormDataContentType(request.headers.get('content-type'))
    ) {
      throw new FormDataParseError(error);
    }

    throw error;
  }
}
