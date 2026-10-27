// Fills in the details for the British Kids Championship 2026 (U.S. Kids Golf,
// The Vale Resort, 27-28 October 2026): which course each division plays,
// what the entry fee covers, priority status and the practice round contact.
// Source: tournaments.uskidsgolf.com, British Kids Championship 2026 (Oct 2026).
// Safe to re-run and safe over hand edits: a field is only filled if it is
// empty, and the conditions lines are added only if not already there.
// Run via the Render web shell: node scripts/add-british-kids-championship-info.js
require('dotenv').config();
const pool = require('../db/pool');

const EVENT_SLUG = 'british-kids-championship-2026-2026-10-27';

const info = {
  junior_tees_note:
    'Boys 15-18, 13-14, 12, 11 and 10 play the Wales National Course. Boys 9 play the Lake Course. ' +
    'Boys 8 and under play the Lake Course Front (9 holes). ' +
    'Girls 15-18, 13-14 and 11-12 play the Lake Course. Girls 9-10 and 8 and under play the Lake Course Front (9 holes).',
  prizes: 'Awards for each division, included in the entry fee.'
};

const conditions = [
  'Entry US$245 (9 holes) / US$295 (18 holes)',
  'The fee covers two tournament rounds, practice range access, a tee gift, a caddie bib and awards. The official practice round is not included',
  'Optional personalised caddie bib name placket US$20',
  'Age group is set by age on 15 October 2026',
  'Priority Status earned here is active from January 2027 to 15 January 2028',
  'Practice round bookings: +44 1443 667800 (mention U.S. Kids Golf)',
  'Run by U.S. Kids Golf on the Wales National Course and the Lake Course'
];

async function run() {
  const { rows } = await pool.query(
    `SELECT id, junior_tees_note, prizes, conditions FROM events WHERE slug = $1`, [EVENT_SLUG]
  );
  if (!rows.length) {
    console.log(`Event not found (${EVENT_SLUG}). Nothing changed.`);
    await pool.end();
    return;
  }
  const e = rows[0];

  const have = String(e.conditions || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const seen = new Set(have.map(l => l.toLowerCase()));
  const merged = have.concat(conditions.filter(l => !seen.has(l.toLowerCase())));

  await pool.query(
    `UPDATE events SET
       junior_tees_note = COALESCE(NULLIF(junior_tees_note, ''), $1),
       prizes = COALESCE(NULLIF(prizes, ''), $2),
       conditions = $3,
       updated_at = now()
     WHERE id = $4`,
    [info.junior_tees_note, info.prizes, merged.join('\n'), e.id]
  );
  console.log(`Updated event ${e.id}: ${merged.length - have.length} condition line(s) added.`);
  await pool.end();
}

run().catch(err => {
  console.error('Update failed:', err.message);
  process.exit(1);
});
