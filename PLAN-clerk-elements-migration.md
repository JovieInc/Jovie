# Migration Plan: Clerk Elements → Clerk Core API

> **Status:** In Progress
> **Risk Level:** High (auth changes require human review per agents.md)
> **Target:** Replace deprecated `@clerk/elements` with Clerk Core API while preserving world-class custom UI

## Decisions Made

| Question | Decision |
|----------|----------|
| Update onboarding flow at the same time? | **Yes** (but note: onboarding already uses custom forms, no Clerk Elements migration needed) |
| Add new auth features during migration? | **No** - focus on 1:1 replacement |
| Implement CAPTCHA for bot protection? | **No** |
| Changes to allowed OAuth providers? | **No** - keep Google + Spotify |

## Executive Summary

Clerk Elements is deprecated with no future updates. We need to migrate to **Clerk Core API** (`useSignIn`, `useSignUp` hooks) which gives us:

- ✅ Full control over UI/UX (keep your Apple-level design)
- ✅ Stable, supported API that won't be deprecated
- ✅ Same authentication flows (OTP + OAuth)
- ✅ Better error handling and loading states
- ✅ Smaller bundle (no Elements runtime)

## Current State Analysis

### Files Using Clerk Elements

| File | Elements Used | Migration Complexity |
|------|---------------|---------------------|
| `OtpSignInForm.tsx` | `SignIn.Root`, `SignIn.Step`, `SignIn.Strategy`, `SignIn.Action`, `Clerk.Field`, `Clerk.Label`, `Clerk.Input`, `Clerk.Loading`, `Clerk.Connection`, `Clerk.GlobalError`, `Clerk.FieldError` | High |
| `OtpSignUpForm.tsx` | Same as above but `SignUp.*` | High |
| `AuthInput.tsx` | `Clerk.Input` (asChild pattern) | Medium |
| `OtpInput.tsx` | `Clerk.Input` (type='otp') | Medium |
| `sso-callback/page.tsx` (signin) | `SignIn.Root`, `SignIn.Step`, `SignIn.Captcha` | Low |
| `sso-callback/page.tsx` (signup) | `SignUp.Root`, `SignUp.Step`, `SignUp.Captcha` | Low |

### Current Auth Flows

1. **Email OTP Sign-In:**
   - User enters email → `SignIn.Action submit` → Clerk sends code
   - User enters 6-digit code → `SignIn.Action submit` → Verified

2. **Email OTP Sign-Up:**
   - User enters email → `SignUp.Action submit` → Clerk sends code
   - User enters 6-digit code → `SignUp.Action submit` → Account created

3. **OAuth (Google/Spotify):**
   - `Clerk.Connection name='google'` → Redirect to provider → SSO callback

## Migration Architecture

### New Hook-Based Approach

Replace Elements declarative API with Clerk's imperative hooks:

```tsx
// OLD: Clerk Elements (declarative)
<SignIn.Root>
  <SignIn.Step name="start">
    <Clerk.Field name="identifier">
      <Clerk.Input type="email" />
    </Clerk.Field>
    <SignIn.Action submit>Continue</SignIn.Action>
  </SignIn.Step>
</SignIn.Root>

// NEW: Clerk Core API (imperative)
const { signIn, setActive, isLoaded } = useSignIn();

const handleEmailSubmit = async (email: string) => {
  await signIn.create({ identifier: email });
  await signIn.prepareFirstFactor({
    strategy: 'email_code',
    emailAddressId: signIn.supportedFirstFactors[0].emailAddressId
  });
  setStep('verification');
};

const handleCodeSubmit = async (code: string) => {
  const result = await signIn.attemptFirstFactor({
    strategy: 'email_code',
    code
  });
  if (result.status === 'complete') {
    await setActive({ session: result.createdSessionId });
    router.push('/dashboard');
  }
};
```

### New Component Structure

```text
components/auth/
├── forms/
│   ├── SignInForm.tsx          # Main sign-in orchestrator
│   ├── SignUpForm.tsx          # Main sign-up orchestrator
│   ├── EmailStep.tsx           # Email input step (shared)
│   ├── VerificationStep.tsx    # OTP verification step (shared)
│   └── OAuthButtons.tsx        # Google/Spotify buttons (shared)
├── atoms/
│   ├── AuthInput.tsx           # Standard input (no Clerk.Input)
│   ├── OtpInput.tsx            # OTP input (custom, no Clerk.Input)
│   ├── AuthButton.tsx          # (unchanged)
│   └── ... (other atoms unchanged)
├── hooks/
│   ├── useSignInFlow.ts        # Sign-in state machine
│   ├── useSignUpFlow.ts        # Sign-up state machine
│   └── useOAuthFlow.ts         # OAuth redirect handling
└── OtpSignInForm.tsx           # DEPRECATED - remove after migration
└── OtpSignUpForm.tsx           # DEPRECATED - remove after migration
```

## Implementation Plan

### Phase 1: Core Hooks & State Management (2 PRs)

#### PR 1.1: Create Sign-In Flow Hook

Create `useSignInFlow.ts` that encapsulates all sign-in logic:

```tsx
export type SignInStep = 'method' | 'email' | 'verification';
export type SignInMethod = 'email' | 'google' | 'spotify';

export interface UseSignInFlowReturn {
  // State
  step: SignInStep;
  isLoading: boolean;
  error: string | null;
  email: string;

  // Actions
  startEmailFlow: (email: string) => Promise<void>;
  verifyCode: (code: string) => Promise<void>;
  startOAuth: (provider: 'google' | 'spotify') => Promise<void>;
  goBack: () => void;
  clearError: () => void;
}

export function useSignInFlow(): UseSignInFlowReturn {
  const { signIn, setActive, isLoaded } = useSignIn();
  const [step, setStep] = useState<SignInStep>('method');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');

  // Implementation...
}
```

#### PR 1.2: Create Sign-Up Flow Hook

Same pattern for `useSignUpFlow.ts`:

```tsx
export function useSignUpFlow(): UseSignUpFlowReturn {
  const { signUp, setActive, isLoaded } = useSignUp();
  // Implementation mirrors sign-in with signUp-specific methods
}
```

### Phase 2: Replace Atom Components (1 PR)

#### PR 2.1: Remove Clerk.Input Dependencies

**AuthInput.tsx** - Replace `Clerk.Input` with standard controlled input:

```tsx
// NEW: Standard React input with same styling
export function AuthInput({
  type,
  value,
  onChange,
  onBlur,
  error,
  ...props
}: AuthInputProps) {
  return (
    <Input
      type={type}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      className={cn(authInputClasses, error && 'border-destructive')}
      {...props}
    />
  );
}
```

**OtpInput.tsx** - Build custom OTP input without `Clerk.Input`:

```tsx
// NEW: Fully custom OTP implementation
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  autoFocus = true,
}: OtpInputProps) {
  // Custom 6-digit input with same UX
  // - Auto-advance between digits
  // - Paste support
  // - Haptic feedback
  // - Success animation
}
```

### Phase 3: Build New Form Components (2 PRs)

#### PR 3.1: Create Shared Step Components

**EmailStep.tsx:**
```tsx
interface EmailStepProps {
  email: string;
  onEmailChange: (email: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  error: string | null;
  onBack?: () => void;
}

export function EmailStep({ ... }: EmailStepProps) {
  return (
    <form onSubmit={handleSubmit}>
      <AuthInput
        type="email"
        value={email}
        onChange={e => onEmailChange(e.target.value)}
        error={error}
      />
      <AuthButton loading={isLoading} type="submit">
        Continue with email
      </AuthButton>
      {onBack && <AuthBackButton onClick={onBack} />}
    </form>
  );
}
```

**VerificationStep.tsx:**
```tsx
interface VerificationStepProps {
  email: string;
  onCodeSubmit: (code: string) => void;
  onResend: () => void;
  isLoading: boolean;
  error: string | null;
  onBack: () => void;
}

export function VerificationStep({ ... }: VerificationStepProps) {
  // OTP input with verify button
}
```

**OAuthButtons.tsx:**
```tsx
interface OAuthButtonsProps {
  onGoogleClick: () => void;
  onSpotifyClick: () => void;
  googleLoading: boolean;
  spotifyLoading: boolean;
  lastUsedMethod?: 'google' | 'spotify' | 'email';
}

export function OAuthButtons({ ... }: OAuthButtonsProps) {
  // Same UI as current, but using onClick handlers
}
```

#### PR 3.2: Create New SignInForm & SignUpForm

**SignInForm.tsx:**
```tsx
export function SignInForm() {
  const {
    step,
    isLoading,
    error,
    email,
    startEmailFlow,
    verifyCode,
    startOAuth,
    goBack,
  } = useSignInFlow();

  const [lastAuthMethod] = useLastAuthMethod();

  return (
    <Card>
      {step === 'method' && (
        <MethodSelector
          onEmailClick={() => setLocalStep('email')}
          onGoogleClick={() => startOAuth('google')}
          onSpotifyClick={() => startOAuth('spotify')}
          lastMethod={lastAuthMethod}
        />
      )}

      {step === 'email' && (
        <EmailStep
          email={email}
          onSubmit={startEmailFlow}
          isLoading={isLoading}
          error={error}
          onBack={goBack}
        />
      )}

      {step === 'verification' && (
        <VerificationStep
          email={email}
          onCodeSubmit={verifyCode}
          isLoading={isLoading}
          error={error}
          onBack={goBack}
        />
      )}
    </Card>
  );
}
```

### Phase 4: SSO Callback & Error Handling (1 PR)

#### PR 4.1: Update SSO Callback Pages

Replace `SignIn.Root` + `SignIn.Captcha` with hook-based approach:

```tsx
// app/(auth)/signin/sso-callback/page.tsx
export default function SSOCallback() {
  const { signIn, setActive } = useSignIn();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Handle OAuth callback
        const result = await signIn.handleOAuthCallback();
        if (result.status === 'complete') {
          await setActive({ session: result.createdSessionId });
          // Restore redirect URL from session storage
          const redirectUrl = sessionStorage.getItem('jovie.auth_redirect_url') || '/dashboard';
          router.push(redirectUrl);
        }
      } catch (err) {
        setError(parseClerkError(err));
      }
    };
    handleCallback();
  }, []);

  if (error) return <ErrorDisplay message={error} />;
  return <LoadingSpinner />;
}
```

### Phase 5: Testing & Cleanup (2 PRs)

#### PR 5.1: Update Tests

- Update E2E tests to work with new form structure
- Add unit tests for new hooks
- Test OAuth flows in test mode

#### PR 5.2: Remove Old Code & Dependencies

- Delete `OtpSignInForm.tsx` and `OtpSignUpForm.tsx` (old versions)
- Remove `@clerk/elements` from `package.json`
- Update README and documentation

## Error Handling Strategy

### Clerk Error Mapping

Create a utility to map Clerk API errors to user-friendly messages:

```tsx
// lib/auth/clerk-errors.ts
export function parseClerkError(error: unknown): string {
  if (error instanceof ClerkAPIResponseError) {
    const code = error.errors[0]?.code;

    switch (code) {
      case 'form_identifier_not_found':
        return 'No account found with this email. Would you like to sign up?';
      case 'form_code_incorrect':
        return 'Invalid code. Please check and try again.';
      case 'verification_expired':
        return 'Code expired. Please request a new one.';
      case 'too_many_requests':
        return 'Too many attempts. Please wait a moment.';
      default:
        return error.errors[0]?.message || 'An error occurred';
    }
  }
  return 'An unexpected error occurred';
}
```

## Loading State Management

### Visual Feedback

Maintain current excellent loading UX:

```tsx
// hooks/useSignInFlow.ts
const [loadingState, setLoadingState] = useState<{
  type: 'idle' | 'submitting' | 'verifying' | 'oauth';
  provider?: 'google' | 'spotify';
}>({ type: 'idle' });

// Usage in components
<AuthButton
  loading={loadingState.type === 'submitting'}
  loadingText="Sending code..."
>
  Continue with email
</AuthButton>
```

## OAuth Implementation

### Direct OAuth with Clerk Hooks

```tsx
// hooks/useOAuthFlow.ts
export function useOAuthFlow() {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();

  const startOAuth = async (
    provider: 'google' | 'spotify',
    mode: 'signIn' | 'signUp'
  ) => {
    const auth = mode === 'signIn' ? signIn : signUp;

    await auth.authenticateWithRedirect({
      strategy: `oauth_${provider}`,
      redirectUrl: `/${mode === 'signIn' ? 'signin' : 'signup'}/sso-callback`,
      redirectUrlComplete: sessionStorage.getItem('jovie.auth_redirect_url') || '/dashboard',
    });
  };

  return { startOAuth };
}
```

## Migration Checklist

### Pre-Migration
- [ ] Review current Clerk dashboard settings (redirect URLs, etc.)
- [ ] Document all current auth flows with screenshots
- [ ] Set up feature flag: `feature_new_auth_flow`

### Phase 1: Hooks
- [ ] Create `useSignInFlow` hook
- [ ] Create `useSignUpFlow` hook
- [ ] Create `useOAuthFlow` hook
- [ ] Add comprehensive error handling
- [ ] Unit test all hooks

### Phase 2: Atoms
- [ ] Update `AuthInput` to remove Clerk.Input
- [ ] Build custom `OtpInput` without Clerk.Input
- [ ] Ensure identical visual appearance
- [ ] Test mobile keyboard behavior

### Phase 3: Forms
- [ ] Build `EmailStep` component
- [ ] Build `VerificationStep` component
- [ ] Build `OAuthButtons` component
- [ ] Build new `SignInForm`
- [ ] Build new `SignUpForm`
- [ ] Feature flag the new forms

### Phase 4: SSO & Cleanup
- [ ] Update SSO callback pages
- [ ] Test OAuth flows (Google, Spotify)
- [ ] Update auth layout if needed

### Phase 5: Testing & Launch
- [ ] E2E test full sign-in flow
- [ ] E2E test full sign-up flow
- [ ] E2E test OAuth flows
- [ ] Test redirect URL preservation
- [ ] Test "last auth method" feature
- [ ] Load test (verify no performance regression)
- [ ] Remove feature flag, enable for all
- [ ] Remove old components
- [ ] Remove `@clerk/elements` dependency

## Rollback Plan

1. Feature flag allows instant rollback to old Clerk Elements forms
2. Old components remain until migration is verified (2 weeks)
3. If critical issues, revert PRs in reverse order

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| OAuth flow breaks | Low | High | Thorough testing in staging, feature flag |
| OTP delivery issues | Very Low | High | No change to backend, same Clerk APIs |
| Mobile UX regression | Medium | Medium | Side-by-side testing, haptic feedback preserved |
| Bundle size increase | Low | Low | Core API is smaller than Elements |
| Session handling bugs | Medium | High | Careful testing of setActive(), redirect flows |

## Timeline Estimate

- Phase 1 (Hooks): 1-2 days
- Phase 2 (Atoms): 1 day
- Phase 3 (Forms): 2-3 days
- Phase 4 (SSO): 1 day
- Phase 5 (Testing): 2-3 days
- **Total: 7-10 days of focused work**

## Benefits After Migration

1. **No more deprecation risk** - Core API is stable and supported
2. **Full UI control** - Every pixel is yours to customize
3. **Smaller bundle** - No Elements runtime (~15KB saved)
4. **Better DX** - Cleaner code, easier to debug
5. **Type safety** - Better TypeScript support with hooks
6. **Testability** - Hooks are easier to unit test than declarative components

---

**Status:** Implementation in progress. See branch `claude/migrate-from-clerk-elements-Bti7T`.
