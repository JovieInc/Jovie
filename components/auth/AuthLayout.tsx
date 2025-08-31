import { ReactNode } from 'react';
import { AuthBranding } from './AuthBranding';
import { AuthFormContainer } from './AuthFormContainer';

interface AuthLayoutProps {
  children: ReactNode;
  brandingTitle: string;
  brandingDescription: string;
  formTitle: string;
  gradientFrom?: string;
  gradientVia?: string;
  gradientTo?: string;
  textColorClass?: string;
}

export function AuthLayout({
  children,
  brandingTitle,
  brandingDescription,
  formTitle,
  gradientFrom = 'blue-600',
  gradientVia = 'purple-600',
  gradientTo = 'cyan-600',
  textColorClass = 'text-blue-100'
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex">
      <AuthBranding
        title={brandingTitle}
        description={brandingDescription}
        gradientFrom={gradientFrom}
        gradientVia={gradientVia}
        gradientTo={gradientTo}
        textColorClass={textColorClass}
      />
      <AuthFormContainer title={formTitle}>
        {children}
      </AuthFormContainer>
    </div>
  );
}