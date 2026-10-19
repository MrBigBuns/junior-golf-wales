// Aberdovey Junior Open (3 Aug 2027): bookings are "open soon", so tick
// "Entries not open yet" (the event page then shows "Entries open soon" instead
// of the entry button) and drop the "Bookings open soon." line from its
// conditions. Untick the box in admin when bookings open.
// Needs the entries_not_open column (added by npm run migrate on deploy).
// Run via the Render web shell: node scripts/mark-aberdovey-entries-not-open.js
require('dotenv').config();
const pool = require('../db/pool');

async function run() {
  const { rows } = await pool.query(
    `UPDATE events e SET
        entries_not_open = true,
        conditions = NULLIF(trim(both E'\\n' from regexp_replace(coalesce(e.conditions, ''), '(^|\\n)Bookings open soon\\.?(?=\\n|$)', '', 'g')), ''),
        updated_at = now()
      FROM clubs c
      WHERE c.id = e.club_id AND c.slug = 'aberdovey-golf-club' AND e.date_start = '2027-08-03'
      RETURNING e.slug, e.conditions`
  );
  if (!rows.length) throw new Error('No Aberdovey event found on 2027-08-03');
  rows.forEach(r => console.log(`Updated: ${r.slug}`));
  await pool.end();
}

run().catch(err => {
  console.error('Update failed:', err.message);
  process.exit(1);
});
