// Post a news/update line to an event.
// Usage: node scripts/add-update.js <event-slug> "<message>"
require('dotenv').config();
const pool = require('../db/pool');

async function run() {
  const [, , slug, message] = process.argv;

  if (!slug || !message) {
    console.error('Usage: node scripts/add-update.js <event-slug> "<message>"');
    process.exit(1);
  }

  const { rows: eventRows } = await pool.query(`SELECT id FROM events WHERE slug = $1`, [slug]);
  if (!eventRows.length) {
    console.error(`No event found with slug "${slug}"`);
    process.exit(1);
  }

  const { rows } = await pool.query(
    `INSERT INTO event_updates (event_id, message) VALUES ($1, $2) RETURNING id, created_at`,
    [eventRows[0].id, message]
  );

  console.log(`Update posted (id ${rows[0].id}) at ${rows[0].created_at.toISOString()}`);
  await pool.end();
}

run().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
