// Updates the Royal Porthcawl Junior Open (26 Oct 2027):
//  - age rule 1 January 2026 -> 1 January 2027 (age category and the first
//    condition). The club's page still says 2026, most likely carried over
//    from this year's event; confirm with the club.
//  - junior tees note now says the yardage shown is the back tees.
// Matches the event by club and date, so it still works if the slug was
// changed in admin. Safe to re-run.
// Run via the Render web shell: node scripts/update-porthcawl-2027.js
require('dotenv').config();
const pool = require('../db/pool');

async function run() {
  const { rows } = await pool.query(
    `SELECT e.id, e.slug, e.age_category, e.conditions
       FROM events e JOIN clubs c ON c.id = e.club_id
      WHERE c.slug = 'royal-porthcawl-golf-club' AND e.date_start = '2027-10-26'`
  );
  if (!rows.length) throw new Error('No Royal Porthcawl event found on 2027-10-26');

  for (const e of rows) {
    const age = e.age_category ? e.age_category.replace('1 January 2026', '1 January 2027') : e.age_category;
    const conditions = e.conditions ? e.conditions.replace('1 January 2026', '1 January 2027') : e.conditions;
    await pool.query(
      `UPDATE events SET age_category = $1, conditions = $2, junior_tees_note = $3, updated_at = now() WHERE id = $4`,
      [age, conditions, 'Yardage shown is the back tees. Juniors play the white tees (boys) and the red tees (girls).', e.id]
    );
    console.log(`Updated: ${e.slug}`);
  }
  await pool.end();
}

run().catch(err => {
  console.error('Update failed:', err.message);
  process.exit(1);
});
