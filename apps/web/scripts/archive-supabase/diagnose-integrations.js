#!/usr/bin/env node

/**
 * Integration Health Diagnostic Script
 *
 * This script diagnoses the current state of:
 * 1. Clerk auth integration
 * 2. Supabase client integration
 *
 * Run with: node scripts/diagnose-integrations.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Jovie Integration Health Diagnostic\n');

// Check if we're in the project root
const packageJsonPath = path.join(process.cwd(), 'package.json');
if (!fs.existsSync(packageJsonPath)) {
  console.error('❌ Must be run from project root directory');
  process.exit(1);
}

console.log('📍 Project root detected');

// Check for environment files
const envFiles = ['.env.local', '.env', '.env.development', '.env.production'];
const existingEnvFiles = envFiles.filter(file => fs.existsSync(file));

console.log('\n🔧 Environment Configuration:');
if (existingEnvFiles.length === 0) {
  console.log('❌ No environment files found');
  console.log('   Missing:', envFiles.join(', '));
} else {
  console.log('✅ Found environment files:', existingEnvFiles.join(', '));
}

// Check current environment variables
const requiredEnvVars = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'Clerk authentication',
  NEXT_PUBLIC_SUPABASE_URL: 'Supabase database URL',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'Supabase anonymous key',
};

const optionalEnvVars = {
  CLERK_SECRET_KEY: 'Clerk server-side secret',
  SPOTIFY_CLIENT_ID: 'Spotify integration',
  SPOTIFY_CLIENT_SECRET: 'Spotify integration',
};

console.log('\n🔑 Required Environment Variables:');
let allRequiredSet = true;
for (const [key, description] of Object.entries(requiredEnvVars)) {
  const isSet = !!process.env[key];
  console.log(`${isSet ? '✅' : '❌'} ${key} - ${description}`);
  if (!isSet) allRequiredSet = false;
}

console.log('\n🔧 Optional Environment Variables:');
for (const [key, description] of Object.entries(optionalEnvVars)) {
  const isSet = !!process.env[key];
  console.log(`${isSet ? '✅' : '⚠️'} ${key} - ${description}`);
}

// Check specific integrations
console.log('\n🔗 Integration Analysis:');

console.log('\n1️⃣ Clerk Authentication:');
const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
if (!clerkKey) {
  console.log('❌ Clerk publishable key not configured');
  console.log('   - Authentication will not work');
  console.log('   - Dashboard access will fail');
} else {
  console.log('✅ Clerk publishable key configured');
  if (clerkKey.startsWith('pk_test_')) {
    console.log('🔧 Using TEST environment');
  } else if (clerkKey.startsWith('pk_live_')) {
    console.log('🚀 Using PRODUCTION environment');
  } else {
    console.log('⚠️ Unexpected key format');
  }
}

console.log('\n2️⃣ Supabase Database:');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log('❌ Supabase configuration incomplete');
  console.log('   - Database queries will fail');
  console.log('   - User data loading will fail');
  console.log('   - Artist profiles will not load');
} else {
  console.log('✅ Supabase configuration present');
  try {
    const url = new URL(supabaseUrl);
    if (url.hostname.includes('.supabase.co')) {
      console.log('✅ Valid Supabase URL format');
    } else {
      console.log('⚠️ Unexpected URL format - may be self-hosted');
    }
  } catch {
    console.log('❌ Invalid Supabase URL format');
  }
}

console.log('\n📊 Overall Health Summary:');
if (allRequiredSet) {
  console.log('🎉 All required integrations configured!');
  console.log('   - Ready for development and testing');
} else {
  console.log('🚨 Configuration incomplete');
  console.log('   - Some integrations will not work properly');
  console.log('   - Create .env.local with required variables');
}

console.log('\n💡 Next Steps:');
if (!allRequiredSet) {
  console.log('1. Copy .env.example to .env.local');
  console.log('2. Fill in actual values from your services:');
  console.log('   - Clerk: https://dashboard.clerk.com');
  console.log('   - Supabase: https://supabase.com/dashboard');
  console.log('3. Verify plans are configured and public in Clerk dashboard');
  console.log('4. Restart development server');
} else {
  console.log('✅ Configuration looks good!');
  console.log('1. Verify services are accessible');
  console.log('2. Test key user flows (auth, dashboard, pricing)');
  console.log('3. Check DebugBanner in development for detailed status');
}

console.log('\n🔚 Diagnostic complete\n');
