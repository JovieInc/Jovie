// @coverage-via apps/web/tests/unit/auth/auth-shell-layout-contract.test.tsx
import { AuthBrandPanel } from './AuthBrandPanel';

interface AuthBrandingProps {
  readonly title: string;
  readonly description: string;
  readonly gradientVariant?:
    | 'blue-purple-cyan'
    | 'purple-cyan-blue'
    | 'purple-pink-orange'
    | 'green-blue-purple'
    | 'red-orange-yellow';
  readonly textColorClass?: string;
  readonly showText?: boolean;
}

export function AuthBranding({
  title,
  description,
  showText = true,
}: Readonly<AuthBrandingProps>) {
  return (
    <AuthBrandPanel
      headline={title}
      description={description}
      showText={showText}
    />
  );
}
