// Royal Porthcawl Junior Open, 27 Oct 2026, is fully booked (90 entries against
// a maximum of 75 on the club's page, 19 Oct 2026): tick "Entries closed or
// full" so the event page shows "Entries closed" instead of the entry button.
// Needs the entries_closed column (added by npm run migrate on deploy).
// Run via the Render web shell: node scripts/mark-porthcawl-2026-closed.js
require('dotenv').config();
const pool = require('../db/pool');

async function run() {
  const { rows } = await pool.query(
    `UPDATE events e SET entries_closed = true, updated_at = now()
       FROM clubs c
      WHERE c.id = e.club_id AND c.slug = 'royal-porthcawl-golf-club' AND e.date_start = '2026-10-27'
      RETURNING e.slug`
  );
  if (!rows.length) throw new Error('No Royal Porthcawl event found on 2026-10-27 (run add-porthcawl-2026.js first)');
  rows.forEach(r => console.log(`Marked closed: ${r.slug}`));
  await pool.end();
}

run().catch(err => {
  console.error('Update failed:', err.message);
  process.exit(1);
});
