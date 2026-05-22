import { connection } from 'next/server';
import { Suspense } from 'react';
import { SigninModalClient } from './SigninModalClient';

export default async function SigninModalPage() {
  await connection();
  return (
    <Suspense fallback={null}>
      <SigninModalClient />
    </Suspense>
  );
}
