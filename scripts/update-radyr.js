// One-off enrichment script for the Radyr Golf Club junior open.
// Run once via the Render web shell: node scripts/update-radyr.js
require('dotenv').config();
const pool = require('../db/pool');

async function run() {
  await pool.query(
    `UPDATE clubs SET website = $1, description = $2
     WHERE slug = 'radyr-golf-club'`,
    [
      'https://www.radyrgolf.co.uk',
      'A Harry S Colt parkland course established in 1902, on the outskirts of Cardiff with views over the city, the Vale and the Bristol Channel. Hosted Wales\u2019 first professional golf event in 1904.'
    ]
  );

  await pool.query(
    `UPDATE events SET yardage = $1, par = $2, junior_tees_note = $3
     WHERE slug LIKE 'junior-open-radyr-golf-club%'`,
    [
      6109,
      70,
      'Men\u2019s course yardage/par shown; Radyr has two junior tee categories that shorten the course for younger players \u2014 exact junior yardage not published, check with the club.'
    ]
  );

  console.log('Radyr club and event enriched.');
  await pool.end();
}

run().catch(err => {
  console.error('Update failed:', err.message);
  process.exit(1);
});
