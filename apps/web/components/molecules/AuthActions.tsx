import Link from 'next/link';

export function AuthActions() {
  return (
    <div className='flex items-center gap-1'>
      {/* Login - Linear exact specs via CSS class */}
      <Link href='/signin' className='btn-linear-login focus-ring-themed'>
        Log in
      </Link>
      {/* Signup - Linear exact specs via CSS class */}
      <Link href='/waitlist' className='btn-linear-signup focus-ring-themed'>
        Sign up
      </Link>
    </div>
  );
}
