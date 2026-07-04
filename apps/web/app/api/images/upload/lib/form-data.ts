import { NextResponse } from 'next/server';
import {
  isFormDataParseError,
  parseFormDataBody,
} from '@/lib/http/parse-form-data';
import { UPLOAD_ERROR_CODES } from './constants';
import { errorResponse } from './error-response';

export async function parseImageFormData(
  request: Request,
  invalidFormMessage: string
): Promise<FormData | NextResponse> {
  try {
    return await parseFormDataBody(request);
  } catch (error) {
    if (isFormDataParseError(error)) {
      return errorResponse(
        invalidFormMessage,
        UPLOAD_ERROR_CODES.INVALID_CONTENT_TYPE,
        400
      );
    }

    throw error;
  }
}
