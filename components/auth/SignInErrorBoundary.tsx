'use client';

import React from 'react';

interface SignInErrorBoundaryProps {
  children: React.ReactNode;
}

interface SignInErrorBoundaryState {
  hasError: boolean;
}

export class SignInErrorBoundary extends React.Component<
  SignInErrorBoundaryProps,
  SignInErrorBoundaryState
> {
  constructor(props: SignInErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): SignInErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error for debugging in development
    if (process.env.NODE_ENV === 'development') {
      console.error('SignIn Error Boundary caught an error:', error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className='mt-4 text-center text-sm text-red-600 dark:text-red-400'>
          Sign in failed. Please try again.
        </div>
      );
    }

    return this.props.children;
  }
}