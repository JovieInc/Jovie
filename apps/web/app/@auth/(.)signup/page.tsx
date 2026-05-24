import { connection } from 'next/server';
import { Suspense } from 'react';
import { SignupModalClient } from './SignupModalClient';

export default async function SignupModalPage() {
  await connection();
  return (
    <Suspense fallback={null}>
      <SignupModalClient />
    </Suspense>
  );
}
