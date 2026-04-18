#!/usr/bin/env tsx
/**
 * Demo User Setup Script
 *
 * Creates a demo user in Clerk for product demos and screenshots.
 * Run this ONCE per environment to set up the demo account.
 *
 * Usage:
 *   doppler run -- pnpm tsx scripts/setup-demo-user.ts
 *   doppler run -- pnpm tsx scripts/setup-demo-user.ts --allow-production
 *
 * What this does:
 * 1. Creates a demo user in Clerk (no password, OTP-based)
 * 2. Tags user with metadata { role: 'demo', env: 'demo' }
 * 3. Outputs user ID to add to Doppler
 *
 * Prerequisites:
 * - CLERK_SECRET_KEY must be set (from Doppler or .env)
 * - For production keys (sk_live_...), pass --allow-production flag
 */

import { createClerkClient } from '@clerk/backend';

const DEMO_USER = {
  username: 'timwhite',
  email: 'demo@jov.ie',
  firstName: 'Tim',
  lastName: 'White',
  metadata: {
    role: 'demo',
    env: 'demo',
    purpose: 'Sales demo account for product demos and screenshots',
  },
};

async function setupDemoUser() {
  console.log('🔧 Setting up demo user in Clerk...\n');

  // Validate environment
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.error('❌ Error: CLERK_SECRET_KEY not found');
    console.error(
      '   Run with: doppler run -- pnpm tsx scripts/setup-demo-user.ts'
    );
    process.exit(1);
  }

  // Production safety check
  if (secretKey.startsWith('sk_live_')) {
    const allowProduction = process.argv.includes('--allow-production');
    if (!allowProduction) {
      console.error(
        '❌ Error: CLERK_SECRET_KEY is a production key (sk_live_...)'
      );
      console.error(
        '   To create a demo user in production, pass --allow-production:'
      );
      console.error(
        '   doppler run -- pnpm tsx scripts/setup-demo-user.ts --allow-production'
      );
      process.exit(1);
    }
    console.log('⚠ Using Clerk PRODUCTION instance (--allow-production)\n');
  } else {
    console.log('✓ Using Clerk test instance\n');
  }

  const clerk = createClerkClient({ secretKey });

  console.log(`Creating user: ${DEMO_USER.username} (${DEMO_USER.email})`);

  try {
    // Check if user already exists
    const existingUsers = await clerk.users.getUserList({
      emailAddress: [DEMO_USER.email],
    });

    let clerkId: string;

    if (existingUsers.data.length > 0) {
      const existing = existingUsers.data[0];
      console.log(`  ⚠ User already exists (ID: ${existing.id})`);
      console.log(`  Skipping creation, using existing user\n`);
      clerkId = existing.id;
    } else {
      // Create user with OTP email authentication (no password needed)
      const user = await clerk.users.createUser({
        username: DEMO_USER.username,
        emailAddress: [DEMO_USER.email],
        firstName: DEMO_USER.firstName,
        lastName: DEMO_USER.lastName,
        publicMetadata: DEMO_USER.metadata,
        skipPasswordRequirement: true,
      });

      console.log(`  ✓ Created user (ID: ${user.id})`);
      console.log(
        `  ✓ Tagged with metadata: ${JSON.stringify(DEMO_USER.metadata)}\n`
      );
      clerkId = user.id;
    }

    // Output results
    console.log('\n' + '='.repeat(80));
    console.log('✅ Demo User Setup Complete!');
    console.log('='.repeat(80) + '\n');

    console.log('📋 Add this secret to Doppler:\n');
    console.log(`DEMO_CLERK_USER_ID=${clerkId}`);

    console.log('\n' + '='.repeat(80));
    console.log('📝 Next Steps:');
    console.log('='.repeat(80));
    console.log('1. Copy the secret above to Doppler:');
    console.log(
      '   → https://dashboard.doppler.com/workplace/YOUR_WORKSPACE/projects/jovie-web/configs/dev'
    );
    console.log('2. Use this account for product demos and screenshots');
    console.log(
      '\n💡 This user will be reused across all demo sessions (no need to recreate)'
    );
    console.log('');
  } catch (error) {
    console.error(`  ❌ Failed to create user: ${error}`);
    if (error instanceof Error) {
      console.error(`     ${error.message}`);
    }
    process.exit(1);
  }
}

// Run the setup
setupDemoUser().catch(error => {
  console.error('\n❌ Setup failed:', error);
  process.exit(1);
});
