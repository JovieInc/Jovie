// Mock Clerk server-side functions for Storybook

// Mock user data (same as client mock)
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

// Mock authentication state
const mockAuth = {
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
};

// Server-side function mocks
const auth = () => Promise.resolve(mockAuth);
const currentUser = () => Promise.resolve(mockUser);

// Mock clerkClient for server-side operations
const clerkClient = {
  users: {
    getUser: () => Promise.resolve(mockUser),
    updateUser: () => Promise.resolve(mockUser),
    deleteUser: () => Promise.resolve(),
  },
};

// Mock error handling utilities from @clerk/nextjs/errors
const isClerkAPIResponseError = () => false;

// Mock clerkMiddleware for proxy.ts
const clerkMiddleware = () => (req, res, next) => next?.();

// Export all server-side functions using ES modules for consistency
export {
  auth,
  currentUser,
  clerkClient,
  isClerkAPIResponseError,
  clerkMiddleware,
};

// Also provide default export for compatibility
export default {
  auth,
  currentUser,
};
