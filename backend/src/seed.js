// Runs on every startup.
// 1. Applies safe schema migrations for existing databases (ALTER TABLE IF NOT EXISTS)
// 2. Ensures the super admin account exists
const bcrypt = require('bcrypt');
const { query } = require('./models/db');
const logger = require('./utils/logger');

async function runMigrations() {
  // Migration: add is_super_admin column if it doesn't exist (old DBs)
  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE
  `);

  // Migration: expand role CHECK constraint to include 'user' and 'super_admin'
  // PostgreSQL doesn't support ALTER CONSTRAINT directly; drop and recreate
  // We do this safely by checking if the constraint already allows the new values
  try {
    // Try inserting a test to see if constraint allows new roles (dry run via DO block)
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'users_role_check_v2'
        ) THEN
          ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
          ALTER TABLE users ADD CONSTRAINT users_role_check_v2
            CHECK (role IN ('user', 'researcher', 'admin', 'super_admin'));
        END IF;
      END
      $$
    `);
  } catch (err) {
    // Constraint already updated or DB handles it fine — not fatal
    logger.warn('Migration: role constraint update skipped', { reason: err.message });
  }

  logger.info('Migrations applied successfully.');
}

async function seed() {
  try {
    await runMigrations();

    const existing = await query(
      "SELECT id FROM users WHERE email = 'admin@vulnplatform.com'"
    );

    if (existing.rows.length > 0) {
      // Ensure the existing account always has super_admin role and flag
      await query(`
        UPDATE users
        SET role = 'super_admin', is_super_admin = TRUE
        WHERE email = 'admin@vulnplatform.com'
      `);
      logger.info('Seed: super admin ensured with correct flags.');
      return;
    }

    const hash = await bcrypt.hash('Admin@123456', 12);
    await query(
      `INSERT INTO users (email, password_hash, username, role, is_super_admin)
       VALUES ($1, $2, $3, 'super_admin', TRUE)`,
      ['admin@vulnplatform.com', hash, 'System Admin']
    );
    logger.info('Seed: super admin created — admin@vulnplatform.com / Admin@123456');
  } catch (err) {
    logger.error('Seed error:', err.message);
  }
}

module.exports = seed;
