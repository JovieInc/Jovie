// Mock Clerk authentication components and hooks for Storybook

// Mock user object
const mockUser = {
  id: 'user_mock123',
  firstName: 'John',
  lastName: 'Doe',
  emailAddresses: [
    {
      emailAddress: 'john.doe@example.com',
      id: 'email_mock123',
    },
  ],
  profileImageUrl: 'https://images.clerk.dev/default-avatar.png',
  publicMetadata: {},
  unsafeMetadata: {},
  createOrganization: () => Promise.resolve(),
  createOrganizationMembership: () => Promise.resolve(),
  createOrganizationInvitation: () => Promise.resolve(),
  getSessions: () => Promise.resolve([]),
  getOrganizations: () => Promise.resolve([]),
  getOrganizationInvitations: () => Promise.resolve([]),
  getOrganizationSuggestions: () => Promise.resolve([]),
  update: () => Promise.resolve(),
  reload: () => Promise.resolve(),
  delete: () => Promise.resolve(),
  setProfileImage: () => Promise.resolve(),
  removeProfileImage: () => Promise.resolve(),
};

// Mock session object
const mockSession = {
  id: 'sess_mock123',
  status: 'active',
  lastActiveAt: new Date(),
  expireAt: new Date(Date.now() + 3600000), // 1 hour from now
  user: mockUser,
  getToken: options => {
    if (options?.template) {
      return Promise.resolve('sb-mock-jwt-token-12345');
    }
    return Promise.resolve('sb-mock-session-token-67890');
  },
  touch: () => Promise.resolve(),
  end: () => Promise.resolve(),
  remove: () => Promise.resolve(),
  reload: () => Promise.resolve(),
};

// Default export with all Clerk hooks and components
export const useUser = () => ({
  user: mockUser,
  isSignedIn: true,
  isLoaded: true,
});

export const useAuth = () => ({
  userId: 'user_mock123',
  sessionId: 'sess_mock123',
  getToken: options => {
    if (options?.template) {
      return Promise.resolve('sb-mock-jwt-token-12345');
    }
    return Promise.resolve('sb-mock-session-token-67890');
  },
  isSignedIn: true,
  isLoaded: true,
  signOut: () => Promise.resolve(),
  openSignIn: () => Promise.resolve(),
  openSignUp: () => Promise.resolve(),
  openUserProfile: () => Promise.resolve(),
  has: () => false, // Mock billing/plan checks
});

export const useClerk = () => ({
  signOut: () => Promise.resolve(),
  openSignIn: () => Promise.resolve(),
  openSignUp: () => Promise.resolve(),
  openUserProfile: () => Promise.resolve(),
});

export const useSession = () => ({
  session: mockSession,
  isSignedIn: true,
  isLoaded: true,
});

export const useOrganization = () => ({
  organization: null,
  isLoaded: true,
});

export const useOrganizationList = () => ({
  organizationList: [],
  isLoaded: true,
  setActive: () => Promise.resolve(),
});

// Mock sign-in/sign-up flow hooks
export const useSignIn = () => ({
  isLoaded: true,
  signIn: {
    create: () => Promise.resolve({ status: 'complete' }),
    attemptFirstFactor: () => Promise.resolve({ status: 'complete' }),
    prepareFirstFactor: () => Promise.resolve({ status: 'needs_first_factor' }),
    supportedFirstFactors: [],
  },
  setActive: () => Promise.resolve(),
});

export const useSignUp = () => ({
  isLoaded: true,
  signUp: {
    create: () => Promise.resolve({ status: 'complete' }),
    prepareEmailAddressVerification: () =>
      Promise.resolve({ status: 'needs_verification' }),
    attemptEmailAddressVerification: () =>
      Promise.resolve({ status: 'complete' }),
  },
  setActive: () => Promise.resolve(),
});

// Mock components
export const SignInButton = ({ children, ...props }) => (
  <button type='button' {...props} data-testid='mock-sign-in-button'>
    {children || 'Sign In'}
  </button>
);

export const SignUpButton = ({ children, ...props }) => (
  <button type='button' {...props} data-testid='mock-sign-up-button'>
    {children || 'Sign Up'}
  </button>
);

export const SignOutButton = ({ children, ...props }) => (
  <button type='button' {...props} data-testid='mock-sign-out-button'>
    {children || 'Sign Out'}
  </button>
);

export const UserButton = ({ ...props }) => (
  <div {...props} data-testid='mock-user-button'>
    <img
      src={mockUser.profileImageUrl}
      alt='User avatar'
      style={{ width: 32, height: 32, borderRadius: '50%' }}
    />
  </div>
);

export const SignIn = ({ ...props }) => (
  <div {...props} data-testid='mock-sign-in-component'>
    <h2>Sign In Component (Mock)</h2>
    <p>This is a mocked Clerk SignIn component for Storybook.</p>
  </div>
);

export const SignUp = ({ ...props }) => (
  <div {...props} data-testid='mock-sign-up-component'>
    <h2>Sign Up Component (Mock)</h2>
    <p>This is a mocked Clerk SignUp component for Storybook.</p>
  </div>
);

export const UserProfile = ({ ...props }) => (
  <div {...props} data-testid='mock-user-profile-component'>
    <h2>User Profile Component (Mock)</h2>
    <p>This is a mocked Clerk UserProfile component for Storybook.</p>
  </div>
);

export const ClerkProvider = ({ children }) => children;
export const ClerkLoaded = ({ children }) => children;
export const ClerkLoading = ({ children }) => null;

// Authentication state components
export const SignedIn = ({ children }) => children; // Show content when "signed in" (always in mocked state)
export const SignedOut = ({ children }) => null; // Never show "signed out" content in mocked state

// SSO callback handler mock
export const AuthenticateWithRedirectCallback = () => null;

export const Protect = ({ children, fallback, ...props }) => {
  // In Storybook, always show protected content unless explicitly testing fallback
  return children;
};

// Export default as an object containing all exports for easier importing
export default {
  useUser,
  useAuth,
  useClerk,
  useSession,
  useOrganization,
  useOrganizationList,
  useSignIn,
  useSignUp,
  SignInButton,
  SignUpButton,
  SignOutButton,
  UserButton,
  SignIn,
  SignUp,
  UserProfile,
  ClerkProvider,
  ClerkLoaded,
  ClerkLoading,
  SignedIn,
  SignedOut,
  AuthenticateWithRedirectCallback,
  Protect,
};
