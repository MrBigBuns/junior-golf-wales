// Adds Faldo Futures as an organiser (series), so it appears in the event
// organiser dropdown and gets a /tours/faldo-futures page, and puts any
// Faldo Futures event that has no organiser yet under it.
// Sources: golfbusinessnews.com (Faldo Futures 2027 plans, Oct 2026) and the
// Faldo Futures event page for Langland Bay (2027 qualifier).
// Safe to re-run: the organiser is upserted by slug, and an event is only
// linked if it has no organiser yet.
// Run via the Render web shell: node scripts/add-faldo-futures-organiser.js
require('dotenv').config();
const pool = require('../db/pool');

const organiser = {
  name: 'Faldo Futures',
  slug: 'faldo-futures',
  website: 'https://www.faldoseries.com/the-faldo-futures/',
  description: 'Founded by Sir Nick Faldo and run under the Faldo Series, with support from The R&A. Boys and girls aged 7 to 12 play in three age groups (7-8, 9-10 and 11-12). Juniors first play a local qualifying event hosted by a golf club, usually a shortened 9-hole strokeplay round with no handicap needed. The top players in each division are invited to a Regional Final and can go on to the Faldo Futures Final, which was held at The Belfry in 2026.'
};

async function run() {
  const { rows } = await pool.query(
    `INSERT INTO organisers (name, slug, description, website)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (slug) DO UPDATE SET
       name        = EXCLUDED.name,
       description = COALESCE(EXCLUDED.description, organisers.description),
       website     = COALESCE(EXCLUDED.website, organisers.website)
     RETURNING id, slug, (xmax = 0) AS inserted`,
    [organiser.name, organiser.slug, organiser.description, organiser.website]
  );
  console.log(`${rows[0].inserted ? 'Added' : 'Updated'}: ${organiser.name} -> /tours/${rows[0].slug}`);

  const linked = await pool.query(
    `UPDATE events SET organiser_id = $1, updated_at = now()
     WHERE title ILIKE '%faldo futures%' AND organiser_id IS NULL`,
    [rows[0].id]
  );
  console.log(`Linked ${linked.rowCount} Faldo Futures event(s) with no organiser.`);

  await pool.end();
}

run().catch(err => {
  console.error('Update failed:', err.message);
  process.exit(1);
});
