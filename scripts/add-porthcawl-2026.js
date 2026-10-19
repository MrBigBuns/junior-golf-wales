// Adds the 2026 Royal Porthcawl Junior Open (Tuesday 27 October 2026), from the
// club's competition page (screenshot, 19 Oct 2026). The page was fully booked:
// 90 entries against a maximum of 75.
// Only the conditions visible on the page are included (the rest sit behind its
// "Read more"; they are probably the same as the 2027 listing).
// If an event already exists for Royal Porthcawl on that date (e.g. a tentative
// one) it is updated rather than duplicated; otherwise one is added. Safe to re-run.
// Run via the Render web shell: node scripts/add-porthcawl-2026.js
require('dotenv').config();
const pool = require('../db/pool');

const DATE = '2026-10-27';
const SLUG = 'junior-open-royal-porthcawl-golf-club-2026-10-27';

const e = {
  title: 'Royal Porthcawl Junior Open',
  format: 'Medal (stroke play), in handicap divisions',
  ageCategory: 'Under 18 on 1 January 2026',
  entryFee: 25.00,
  juniorTeesNote: 'Boys play the white tees, girls the red tees.',
  catering: 'Lunch included in the entry fee; meals served in the dining room after the round.',
  hcpAllowanceInfo: '95% handicap allowance. Maximum 75 entries. Fully booked when last checked (90 entries, 19 Oct 2026).',
  conditions: [
    'All competitors must be under 18 years of age on 1 January 2026',
    'Players will play in their respective handicap divisions',
    'Maximum ten players from each Club',
    'No caddies permitted',
    'Entry Fee £25 to include lunch. Meals will be available after the round in the dining room.',
    'Handicap certificates/ CDH Lifetime ID required on registration',
    'Prize-giving will take place immediately after the final player returns their card.'
  ].join('\n')
};

async function run() {
  const { rows: clubs } = await pool.query(`SELECT id FROM clubs WHERE slug = 'royal-porthcawl-golf-club'`);
  if (!clubs.length) throw new Error('No club found with slug royal-porthcawl-golf-club');
  const clubId = clubs[0].id;

  const { rows: existing } = await pool.query(
    `SELECT id, slug FROM events WHERE club_id = $1 AND date_start = $2`, [clubId, DATE]
  );

  const values = [e.title, e.format, e.ageCategory, e.entryFee, e.juniorTeesNote, e.catering, e.hcpAllowanceInfo, e.conditions];

  if (existing.length) {
    await pool.query(
      `UPDATE events SET title=$1, format=$2, holes=18, gender='Any Gender', age_category=$3, entry_fee=$4,
              junior_tees_note=$5, catering=$6, hcp_allowance_info=$7, conditions=$8,
              status='confirmed', updated_at=now()
        WHERE id = $9`,
      [...values, existing[0].id]
    );
    console.log(`Updated: ${existing[0].slug}`);
  } else {
    await pool.query(
      `INSERT INTO events (title, slug, club_id, date_start, format, holes, gender, age_category, entry_fee,
                           junior_tees_note, catering, hcp_allowance_info, conditions, status)
       VALUES ($1, $9, $10, $11, $2, 18, 'Any Gender', $3, $4, $5, $6, $7, $8, 'confirmed')`,
      [...values, SLUG, clubId, DATE]
    );
    console.log(`Added: ${SLUG}`);
  }
  await pool.end();
}

run().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
