import { type NextRequest, NextResponse } from 'next/server';
import { APP_ROUTES } from '@/constants/routes';
import {
  BillingUnavailableError,
  getCurrentUserEntitlements,
} from '@/lib/entitlements/server';
import { captureCriticalError, captureWarning } from '@/lib/error-tracking';

/**
 * Configuration for creating an admin route handler
 */
export type AdminRouteConfig<TPayload, TResult = void> = {
  /** Human-readable action name for error messages */
  actionName: string;
  /** The server action function to call */
  actionFn: (formData: FormData) => Promise<TResult>;
  /** Function to parse and validate request payload */
  parsePayload: (request: NextRequest) => Promise<TPayload>;
  /** Optional function to build custom success response from payload */
  buildSuccessResponse?: (
    payload: TPayload,
    result: TResult
  ) => Record<string, unknown>;
  /** Error context for Sentry tracking */
  errorContext: {
    route: string;
    action: string;
  };
  /** Optional custom error message for failures */
  errorMessage?: string;
};

/**
 * Determines if the request wants a JSON response
 */
function wantsJsonResponse(request: NextRequest): boolean {
  return (
    (request.headers.get('accept') ?? '').includes('application/json') ||
    (request.headers.get('content-type') ?? '').includes('application/json')
  );
}

/**
 * Creates an admin route handler with standardized authorization,
 * error handling, and response formatting.
 *
 * @example
 * ```ts
 * export const POST = createAdminRouteHandler({
 *   actionName: 'toggle marketing preferences',
 *   actionFn: toggleCreatorMarketingAction,
 *   parsePayload: parseToggleMarketingPayload,
 *   buildSuccessResponse: (payload) => ({
 *     success: true,
 *     marketingOptOut: payload.nextMarketingOptOut,
 *   }),
 *   errorContext: {
 *     route: '/app/admin/users/toggle-marketing',
 *     action: 'toggle_marketing_user',
 *   },
 * });
 * ```
 */
export function createAdminRouteHandler<TPayload, TResult = void>(
  config: AdminRouteConfig<TPayload, TResult>
) {
  return async function POST(request: NextRequest) {
    const wantsJson = wantsJsonResponse(request);

    // Check admin authorization
    let entitlements;
    try {
      entitlements = await getCurrentUserEntitlements();
    } catch (error) {
      if (error instanceof BillingUnavailableError) {
        // Billing DB down but admin status is known — use it
        entitlements = {
          isAdmin: error.isAdmin,
          userId: error.userId,
          email: null,
          isAuthenticated: true,
        };
      } else {
        throw error;
      }
    }
    if (!entitlements.isAdmin) {
      captureWarning(
        `[admin/route-factory] Admin auth denied for ${config.actionName}`,
        {
          route: config.errorContext.route,
          action: config.errorContext.action,
          userId: entitlements.userId,
          email: entitlements.email,
          isAuthenticated: entitlements.isAuthenticated,
        }
      );

      if (wantsJson) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized - admin access required' },
          { status: 403 }
        );
      }
      const redirectUrl = new URL(APP_ROUTES.DASHBOARD_OVERVIEW, request.url);
      return NextResponse.redirect(redirectUrl);
    }

    try {
      // Parse and validate payload
      const payload = await config.parsePayload(request);

      // Execute the action
      const result = await config.actionFn(
        convertPayloadToFormData(payload as Record<string, unknown>)
      );

      // Return success response
      if (wantsJson) {
        const response = config.buildSuccessResponse
          ? config.buildSuccessResponse(payload, result)
          : { success: true };
        return NextResponse.json(response);
      }

      const redirectUrl = new URL(APP_ROUTES.ADMIN_CREATORS, request.url);
      return NextResponse.redirect(redirectUrl);
    } catch (error) {
      // Track error in Sentry
      await captureCriticalError(
        `Admin action failed: ${config.actionName}`,
        error instanceof Error ? error : new Error(String(error)),
        {
          route: config.errorContext.route,
          action: config.errorContext.action,
          adminEmail: entitlements.email,
          timestamp: new Date().toISOString(),
        }
      );

      // Return error response
      if (wantsJson) {
        const message =
          error instanceof Error
            ? error.message
            : (config.errorMessage ?? `Failed to ${config.actionName}`);
        return NextResponse.json(
          { success: false, error: message },
          { status: 500 }
        );
      }

      const redirectUrl = new URL(APP_ROUTES.ADMIN_CREATORS, request.url);
      return NextResponse.redirect(redirectUrl);
    }
  };
}

/**
 * Converts a parsed payload object to FormData for server actions
 */
function convertPayloadToFormData(payload: Record<string, unknown>): FormData {
  const formData = new FormData();

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      // Arrays are JSON-stringified (common pattern in existing routes)
      formData.set(key, JSON.stringify(value));
    } else if (typeof value === 'boolean') {
      formData.set(key, value ? 'true' : 'false');
    } else if (typeof value === 'object' && value !== null) {
      // Objects are JSON-stringified to avoid [object Object]
      formData.set(key, JSON.stringify(value));
    } else {
      formData.set(key, String(value));
    }
  }

  return formData;
}
