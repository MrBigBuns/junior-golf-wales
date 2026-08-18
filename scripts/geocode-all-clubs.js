// Backfills lat/lng for every club that has an address but no coordinates
// yet. Run via the Render web shell: node scripts/geocode-all-clubs.js
require('dotenv').config();
const pool = require('../db/pool');
const { geocodeAddress } = require('../lib/geocode');

async function run() {
  const { rows: clubs } = await pool.query(
    `SELECT id, name, address FROM clubs WHERE (lat IS NULL OR lng IS NULL) AND address IS NOT NULL`
  );

  console.log(`${clubs.length} club(s) need geocoding.`);

  for (const club of clubs) {
    const geo = await geocodeAddress(club.address);
    if (geo) {
      await pool.query(`UPDATE clubs SET lat = $1, lng = $2 WHERE id = $3`, [geo.lat, geo.lng, club.id]);
      console.log(`✓ ${club.name}: ${geo.lat}, ${geo.lng}`);
    } else {
      console.log(`✗ ${club.name}: could not geocode "${club.address}"`);
    }
    // Be polite to the Nominatim fallback path (~1 req/sec limit) even
    // though most addresses should resolve via Postcodes.io instantly.
    await new Promise(r => setTimeout(r, 1100));
  }

  await pool.end();
}

run().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
