// One-off enrichment script for Llantrisant & Pontyclun Golf Club junior open.
// Run via the Render web shell: node scripts/update-llantrisant.js
//
// Course yardage/par corrected from the club's physical scorecard (White tee
// 6,302 yds, par 72) — this supersedes an earlier value pulled from aggregator
// sites (5,328 yds, par 68), which appears to be outdated or for a different
// tee configuration. Event detail fields sourced directly from the event page
// (entry fee, closing date, format, gender, hcp limits, age limit, handicap
// allowance, entry link).
require('dotenv').config();
const pool = require('../db/pool');

async function run() {
  const clubResult = await pool.query(
    `UPDATE clubs SET website = $1, description = $2, address = $3
     WHERE slug = 'llantrisant-and-pontyclun-golf-club'
     RETURNING id, name, address`,
    [
      'https://www.llantrisantgolfclub.com/',
      'A parkland course lined with mature trees and bounded by the River Ely, established in 1927 in the heart of Talbot Green. Recognised as a Wales Golf junior club of the year.',
      'Ely Valley Road, Talbot Green, Pontyclun, CF72 8HZ'
    ]
  );
  console.log(`Clubs updated: ${clubResult.rowCount}`, clubResult.rows);

  const eventResult = await pool.query(
    `UPDATE events SET yardage = $1, par = $2, entry_url = $3, format = $4,
            entry_deadline = $5, gender = $6, hcp_index_limit = $7, age_category = $8,
            hcp_allowance_info = $9, scorecard = $10
     WHERE slug LIKE 'junior-open-llantrisant%'
     RETURNING slug, yardage`,
    [
      6302,
      72,
      'https://docs.google.com/forms/d/e/1FAIpQLSebzhZMypimqD6feCXoKVHluDfkqe38ZgHBtzkf0meiOSn23A/viewform?pli=1',
      'Individual Strokeplay & Stableford',
      '2026-08-21',
      'Any Gender',
      '54.0 (boys) 54.0 (girls)',
      'Juniors Under 18',
      'Strokeplay/Medal up to 18.4 handicap. Stableford 18.5 to 36 handicap. \u00a37.50 for 9 hole competition 36+ handicap. Glamorgan County Order of Merit Event \u2014 Medal Only.',
      JSON.stringify([
        { hole: 1, par: 4, strokeIndex: 13, yards: { white: 319, yellow: 296, red: 254 } },
        { hole: 2, par: 3, strokeIndex: 15, yards: { white: 152, yellow: 117, red: 102 } },
        { hole: 3, par: 5, strokeIndex: 5, yards: { white: 494, yellow: 482, red: 437 } },
        { hole: 4, par: 4, strokeIndex: 11, yards: { white: 282, yellow: 252, red: 252 } },
        { hole: 5, par: 3, strokeIndex: 17, yards: { white: 117, yellow: 113, red: 85 } },
        { hole: 6, par: 5, strokeIndex: 1, yards: { white: 544, yellow: 513, red: 478 } },
        { hole: 7, par: 4, strokeIndex: 3, yards: { white: 352, yellow: 335, red: 303 } },
        { hole: 8, par: 4, strokeIndex: 7, yards: { white: 375, yellow: 337, red: 303 } },
        { hole: 9, par: 4, strokeIndex: 9, yards: { white: 334, yellow: 323, red: 255 } },
        { hole: 10, par: 5, strokeIndex: 14, yards: { white: 496, yellow: 481, red: 449 } },
        { hole: 11, par: 4, strokeIndex: 8, yards: { white: 389, yellow: 357, red: 315 } },
        { hole: 12, par: 4, strokeIndex: 4, yards: { white: 416, yellow: 386, red: 327 } },
        { hole: 13, par: 3, strokeIndex: 18, yards: { white: 162, yellow: 144, red: 120 } },
        { hole: 14, par: 4, strokeIndex: 2, yards: { white: 420, yellow: 397, red: 361 } },
        { hole: 15, par: 5, strokeIndex: 10, yards: { white: 537, yellow: 511, red: 427 } },
        { hole: 16, par: 4, strokeIndex: 6, yards: { white: 400, yellow: 364, red: 323 } },
        { hole: 17, par: 4, strokeIndex: 16, yards: { white: 341, yellow: 328, red: 296 } },
        { hole: 18, par: 3, strokeIndex: 12, yards: { white: 172, yellow: 166, red: 136 } }
      ])
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
