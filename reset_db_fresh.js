require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

let connectionString = process.env.DATABASE_URL || '';
if (connectionString.includes('sslmode=require')) {
  connectionString = connectionString.replace('sslmode=require', 'sslmode=no-verify');
} else if (!connectionString.includes('sslmode=')) {
  connectionString += (connectionString.includes('?') ? '&' : '?') + 'sslmode=no-verify';
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function resetDbFresh() {
  console.log('--- Wiping Database Fresh ---');
  try {
    // Truncate all tables in PostgreSQL
    const tablenames = [
      'SocialReaction',
      'SocialMessage',
      'HiddenSocialChat',
      'SocialCall',
      'FollowRequest',
      'Like',
      'Comment',
      'SavedPost',
      'Post',
      'Story',
      'Message',
      'TranslationHistory',
      'PendingUser',
      'Session',
      'Account',
      'VerificationToken',
      'User'
    ];

    for (const table of tablenames) {
      await pool.query(`TRUNCATE TABLE "${table}" CASCADE;`);
      console.log(`Cleared table: ${table}`);
    }

    console.log('✅ Database reset completely fresh! Zero users, zero messages, zero posts remaining.');
  } catch (err) {
    console.error('Error during DB reset:', err);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

resetDbFresh();
