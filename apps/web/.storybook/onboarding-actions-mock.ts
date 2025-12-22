// Mock for @/app/onboarding/actions in Storybook
// These server actions cannot run in the browser, so we provide stubs

export async function completeOnboarding(
  _formData: FormData
): Promise<{ success: boolean; error?: string }> {
  // Simulate a successful onboarding completion
  console.log('[Storybook Mock] completeOnboarding called');
  return { success: true };
}

export async function checkHandleAvailability(
  _handle: string
): Promise<{ available: boolean; error?: string }> {
  console.log('[Storybook Mock] checkHandleAvailability called');
  return { available: true };
}

export async function validateDisplayName(
  _name: string
): Promise<{ valid: boolean; error?: string }> {
  console.log('[Storybook Mock] validateDisplayName called');
  return { valid: true };
}
