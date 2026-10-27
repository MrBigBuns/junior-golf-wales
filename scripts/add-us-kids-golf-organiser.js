// Adds U.S. Kids Golf as an organiser (series), so it appears in the event
// organiser dropdown and gets a /tours/us-kids-golf page, and puts the
// British Kids Championship 2026 under it.
// Source: tournaments.uskidsgolf.com (British Kids Championship 2026, Oct 2026).
// Safe to re-run: the organiser is upserted by slug, and the event is only
// linked if it has no organiser yet.
// Run via the Render web shell: node scripts/add-us-kids-golf-organiser.js
require('dotenv').config();
const pool = require('../db/pool');

const organiser = {
  name: 'U.S. Kids Golf',
  slug: 'us-kids-golf',
  website: 'https://tournaments.uskidsgolf.com/',
  description: 'U.S. Kids Golf runs junior tournaments around the world for players aged 5 to 18. Its events earn Priority Status, which opens the way to its Regional, International and World Championships. In Wales it runs the British Kids Championship at The Vale Resort, a two-day event with 9 and 18 hole divisions.'
};

const EVENT_SLUG = 'british-kids-championship-2026-2026-10-27';

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
     WHERE slug = $2 AND organiser_id IS NULL`,
    [rows[0].id, EVENT_SLUG]
  );
  console.log(linked.rowCount
    ? 'Linked the British Kids Championship 2026 to U.S. Kids Golf.'
    : 'British Kids Championship 2026 not linked (already has an organiser, or not found).');

  await pool.end();
}

run().catch(err => {
  console.error('Update failed:', err.message);
  process.exit(1);
});
