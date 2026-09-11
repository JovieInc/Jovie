// Mock for @clerk/elements in Storybook
// These components are used for Clerk's custom auth UI

import React from 'react';

// Common components
export const GlobalError = ({ className, children }) => (
  <div className={className}>{children}</div>
);

export const Field = ({ name, children }) => (
  <div data-field={name}>{children}</div>
);

export const FieldError = ({ className }) => <span className={className} />;

export const Input = React.forwardRef(({ className, ...props }, ref) => (
  <input ref={ref} className={className} {...props} />
));
Input.displayName = 'ClerkInput';

export const Label = ({ className, children }) => (
  // biome-ignore lint/a11y/noLabelWithoutControl: Mock component for testing
  <label className={className}>{children}</label>
);

// Sign-in specific components
export const SignInRoot = ({ children, routing, path }) => (
  <div data-clerk-signin data-routing={routing} data-path={path}>
    {children}
  </div>
);

export const SignInStep = ({ name, children, ...props }) => (
  <div data-step={name} {...props}>
    {children}
  </div>
);

export const SignInAction = ({ submit, children, className, ...props }) => (
  <button type={submit ? 'submit' : 'button'} className={className} {...props}>
    {children}
  </button>
);

export const SignInSupportedStrategy = ({ name, children }) => (
  <div data-strategy={name}>{children}</div>
);

export const SignInSafeIdentifier = () => <span>user@example.com</span>;

// Sign-up specific components
export const SignUpRoot = ({ children, routing, path }) => (
  <div data-clerk-signup data-routing={routing} data-path={path}>
    {children}
  </div>
);

export const SignUpStep = ({ name, children, ...props }) => (
  <div data-step={name} {...props}>
    {children}
  </div>
);

export const SignUpAction = ({ submit, children, className, ...props }) => (
  <button type={submit ? 'submit' : 'button'} className={className} {...props}>
    {children}
  </button>
);

// Default exports for namespace imports
const common = {
  GlobalError,
  Field,
  FieldError,
  Input,
  Label,
};

const signIn = {
  Root: SignInRoot,
  Step: SignInStep,
  Action: SignInAction,
  SupportedStrategy: SignInSupportedStrategy,
  SafeIdentifier: SignInSafeIdentifier,
};

const signUp = {
  Root: SignUpRoot,
  Step: SignUpStep,
  Action: SignUpAction,
};

export default common;
export { common, signIn, signUp };
