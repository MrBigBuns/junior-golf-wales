// One-off enrichment script for the Radyr Golf Club junior open.
// Run once via the Render web shell: node scripts/update-radyr.js
require('dotenv').config();
const pool = require('../db/pool');

async function run() {
  const clubResult = await pool.query(
    `UPDATE clubs SET website = $1, description = $2, address = $3
     WHERE slug = 'radyr-golf-club'
     RETURNING id, name, address`,
    [
      'https://www.radyrgolf.co.uk',
      'A Harry S Colt parkland course established in 1902, on the outskirts of Cardiff with views over the city, the Vale and the Bristol Channel. Hosted Wales\u2019 first professional golf event in 1904.',
      'Drysgol Rd, Radyr, Cardiff CF15 8BS'
    ]
  );
  console.log(`Clubs updated: ${clubResult.rowCount}`, clubResult.rows);

  const eventResult = await pool.query(
    `UPDATE events SET yardage = $1, par = $2, junior_tees_note = $3, scorecard = $4,
            entry_url = $5, entry_email = $6, entry_phone = $7,
            registration_opens = $8, entry_deadline = $9, entry_fee_tiers = $10,
            format = $11, gender = $12, hcp_index_limit = $13, age_category = $14,
            hcp_allowance_info = $15, catering = $16, prizes = $17
     WHERE slug LIKE 'junior-open-radyr-golf-club%'
     RETURNING slug, yardage`,
    [
      6109,
      70,
      'Men\u2019s course yardage/par shown; Radyr has two junior tee categories that shorten the course for younger players \u2014 exact junior yardage not published, check with the club.',
      JSON.stringify([
        { hole: 1, par: 4, strokeIndex: 15, yards: { white: 300, yellow: 298, red: 292 } },
        { hole: 2, par: 4, strokeIndex: 9, yards: { white: 311, yellow: 301, red: 292 } },
        { hole: 3, par: 3, strokeIndex: 13, yards: { white: 165, yellow: 158, red: 146 } },
        { hole: 4, par: 4, strokeIndex: 5, yards: { white: 405, yellow: 396, red: 342 } },
        { hole: 5, par: 5, strokeIndex: 1, yards: { white: 502, yellow: 494, red: 426 } },
        { hole: 6, par: 4, strokeIndex: 7, yards: { white: 412, yellow: 405, red: 403 } },
        { hole: 7, par: 3, strokeIndex: 11, yards: { white: 177, yellow: 169, red: 139 } },
        { hole: 8, par: 5, strokeIndex: 17, yards: { white: 480, yellow: 472, red: 439 } },
        { hole: 9, par: 4, strokeIndex: 3, yards: { white: 446, yellow: 440, red: 436 } }
      ]),
      'https://www.golfempire.co.uk/new/entryform.php?eventid=8354',
      null,
      null,
      // PLACEHOLDER — not sourced from the club; demo values to show the layout.
      // Replace with real registration window / fees when known, or clear these
      // three fields (set to null) to fall back to the plain single entry_fee line.
      '2025-11-01',
      '2026-08-12',
      JSON.stringify([
        { label: 'Member', amount: 12.00 },
        { label: 'Non-member', amount: 15.00 }
      ]),
      'Individual Strokeplay & Stableford',
      'Any Gender',
      '54.0 (boys) 54.0 (girls)',
      'Juniors',
      '0-12 hcp Strokeplay. 13-36 hcp Stableford. 37+ must enter the 37+ hcp junior open on short course.',
      'Includes meal.',
      'Longest drive & nearest-the-pin.'
    ]
  );
  console.log(`Events updated: ${eventResult.rowCount}`, eventResult.rows);

  console.log('Radyr club and event enriched.');
  await pool.end();
}

run().catch(err => {
  console.error('Update failed:', err.message);
  process.exit(1);
});
