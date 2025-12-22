import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/neon-http';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(__dirname, '../.env.local') });

async function testConnection() {
  try {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      console.error('❌ DATABASE_URL is not set in environment variables');
      console.log('\nPlease add DATABASE_URL to your .env.local file:');
      console.log('DATABASE_URL="your_neon_connection_string_here"');
      return;
    }

    console.log('🔌 Testing database connection to Neon...');
    console.log(
      `🔗 Using database: ${databaseUrl.split('@')[1]?.split('/')[0] || 'unknown'}`
    );

    const sql = neon(databaseUrl);
    const db = drizzle(sql);

    console.log('⏳ Executing test query...');
    const startTime = Date.now();

    // Test a simple query
    const result = await db.execute('SELECT NOW() as time');
    const queryTime = Date.now() - startTime;

    console.log('✅ Database connection successful!');
    console.log('🕒 Query time:', queryTime, 'ms');
    console.log('⏰ Database time:', result.rows[0]?.time);

    // Test a more complex query if the first one worked
    try {
      const tables = await db.execute(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        LIMIT 5
      `);
      console.log(
        '📊 Available tables:',
        tables.rows
          .map(
            (r: Record<string, unknown>) =>
              (r as { table_name: string }).table_name
          )
          .join(', ')
      );
    } catch {
      console.log(
        'ℹ️ Could not list tables (this is normal if permissions are restricted)'
      );
    }
  } catch (error) {
    console.error('❌ Database connection failed:');
    console.error(error);

    // Provide helpful troubleshooting tips
    console.log('\nTroubleshooting tips:');
    console.log('1. Check if your DATABASE_URL in .env.local is correct');
    console.log('2. Verify your Neon database is running and accessible');
    console.log('3. Check if your IP is whitelisted in Neon dashboard');
    console.log('4. Ensure your database credentials are correct');
  }
}

testConnection();
