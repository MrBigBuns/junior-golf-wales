// Reworded junior tees note for the Aberdovey Junior Open (3 Aug 2027), so the
// yardage shown above it is not read as the Gold tees length. Only that one
// field changes; nothing else on the event is touched.
// Matches by club and date, so it still works if the slug was changed in admin.
// Safe to re-run: node scripts/update-aberdovey-tees.js
require('dotenv').config();
const pool = require('../db/pool');

const NOTE = 'Yardage shown is the club’s course length, not the junior tees. Boys play the Gold tees (handicap index 28.0 or less), girls the Orange tees (handicap index 36.0 or less).';

async function run() {
  const { rows } = await pool.query(
    `UPDATE events e SET junior_tees_note = $1, updated_at = now()
       FROM clubs c
      WHERE c.id = e.club_id AND c.slug = 'aberdovey-golf-club' AND e.date_start = '2027-08-03'
      RETURNING e.slug`,
    [NOTE]
  );
  if (!rows.length) throw new Error('No Aberdovey event found on 2027-08-03');
  rows.forEach(r => console.log(`Updated: ${r.slug}`));
  await pool.end();
}

run().catch(err => {
  console.error('Update failed:', err.message);
  process.exit(1);
});
