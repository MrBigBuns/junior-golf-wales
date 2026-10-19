// Adds the Daily Telegraph Junior Championship and the Junior European Open
// as organisers (series), so they appear in the event organiser dropdown and
// get a /tours/<slug> page.
// Sources: acedsport.com/tours-daily-telegraph and progressjuniorgolf.com
// (Oct 2026). The Junior European Open details are from golforganiser.com.
// Re-running updates a field only when a value is set here (a null keeps what is saved).
// Safe to re-run: organisers are upserted by slug.
// Run via the Render web shell: node scripts/add-telegraph-and-euro-organisers.js
require('dotenv').config();
const pool = require('../db/pool');

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const organisers = [
  {
    name: 'Daily Telegraph Junior Championship',
    website: 'https://acedsport.com/tours-daily-telegraph/',
    description: 'Qualifying events for the Justin Rose Telegraph Junior Golf Championship, open to boys and girls with gross and net categories. Qualifiers run through the spring and summer at courses around the UK, with the best players going through to a Grand Final at Quinta do Lago in Portugal. Several qualifiers are run by ACED, and some Welsh clubs list their junior opens as Telegraph qualifiers, so check the club’s entry details for how results count.'
  },
  {
    name: 'Junior European Open',
    website: 'https://www.golforganiser.com/junior-european-open',
    description: 'First staged in 1993, the Junior European Open is widely considered the toughest test in junior golf across Europe. A record 176 juniors played in the 2025 Finals. The Champions Week Finals are played in Spain over five rounds, with qualifying events leading up to them.'
  }
];

async function run() {
  for (const o of organisers) {
    const { rows } = await pool.query(
      `INSERT INTO organisers (name, slug, description, website)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE SET
         name        = EXCLUDED.name,
         description = COALESCE(EXCLUDED.description, organisers.description),
         website     = COALESCE(EXCLUDED.website, organisers.website)
       RETURNING slug, (xmax = 0) AS inserted`,
      [o.name, slugify(o.name), o.description, o.website]
    );
    console.log(`${rows[0].inserted ? 'Added' : 'Updated'}: ${o.name} -> /tours/${rows[0].slug}`);
  }

  console.log('Organisers loaded.');
  await pool.end();
}

run().catch(err => {
  console.error('Update failed:', err.message);
  process.exit(1);
});
