// One-off enrichment script for Llantrisant & Pontyclun Golf Club junior open.
// Run via the Render web shell: node scripts/update-llantrisant.js
//
// Sourced from public club/course-directory pages (address, par, yardage,
// website, phone) and Golf Empire's public South Wales junior listing (date,
// fee, entry link — matches the row already seeded from events_seed.csv).
// NOT included: hcp index limit, catering, prizes — the Golf Empire detail
// page fetch for this event didn't return reliable Llantrisant-specific data,
// so these are left blank rather than guessed. Fill in later if you visit
// the event page yourself and copy the details across.
require('dotenv').config();
const pool = require('../db/pool');

async function run() {
  const clubResult = await pool.query(
    `UPDATE clubs SET website = $1, description = $2, address = $3
     WHERE slug = 'llantrisant-and-pontyclun-golf-club'
     RETURNING id, name, address`,
    [
      'https://www.llantrisantgolfclub.com/',
      'A parkland course lined with mature trees and bounded by the River Ely, established in 1927 in the heart of Talbot Green. Under 6,000 yards but with small greens and narrow fairways, recognised as a Wales Golf junior club of the year.',
      'Ely Valley Road, Talbot Green, Pontyclun, CF72 8HZ'
    ]
  );
  console.log(`Clubs updated: ${clubResult.rowCount}`, clubResult.rows);

  const eventResult = await pool.query(
    `UPDATE events SET yardage = $1, par = $2, entry_url = $3, format = $4
     WHERE slug LIKE 'junior-open-llantrisant%'
     RETURNING slug, yardage`,
    [
      5328,
      68,
      'https://www.golfempire.co.uk/new/entryform.php?eventid=20304',
      'Individual Strokeplay'
    ]
  );
  console.log(`Events updated: ${eventResult.rowCount}`, eventResult.rows);

  console.log('Llantrisant & Pontyclun club and event enriched.');
  await pool.end();
}

run().catch(err => {
  console.error('Update failed:', err.message);
  process.exit(1);
});
