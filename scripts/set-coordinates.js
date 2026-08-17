// Sets latitude/longitude directly for clubs where live geocoding (Nominatim,
// called from admin club save) isn't returning results reliably — likely
// because Nominatim's free public instance blocks/rate-limits requests from
// cloud hosting IPs like Render's. Coordinates below are from Wikipedia
// (Radyr) and a UK postcode lookup for CF72 8HZ (Llantrisant & Pontyclun).
// Run via the Render web shell: node scripts/set-coordinates.js
require('dotenv').config();
const pool = require('../db/pool');

async function run() {
  const updates = [
    { slug: 'radyr-golf-club', lat: 51.51417, lng: -3.26389 },
    { slug: 'llantrisant-and-pontyclun-golf-club', lat: 51.536426, lng: -3.388573 }
  ];

  for (const u of updates) {
    const { rows } = await pool.query(
      `UPDATE clubs SET lat = $1, lng = $2 WHERE slug = $3 RETURNING id, name, lat, lng`,
      [u.lat, u.lng, u.slug]
    );
    console.log(rows.length ? rows[0] : `No club found for slug ${u.slug}`);
  }

  await pool.end();
}

run().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
