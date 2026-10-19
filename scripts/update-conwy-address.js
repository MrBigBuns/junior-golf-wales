// Sets Conwy Golf Club's address to "Beacons Way, Conwy, LL32 8ER" and
// re-geocodes it (so the map pin, directions and distance searches use it).
// The club name and "North Wales" are left out: the page shows the region
// separately. County stays Gwynedd (the golfing county, Caernarvonshire).
// Latitude and longitude are only replaced if the lookup succeeds.
// Safe to re-run: node scripts/update-conwy-address.js
require('dotenv').config();
const pool = require('../db/pool');
const { geocodeAddress } = require('../lib/geocode');

const ADDRESS = 'Beacons Way, Conwy, LL32 8ER';

async function run() {
  const { rows } = await pool.query(`SELECT id, name, address FROM clubs WHERE slug = 'conwy-golf-club'`);
  if (!rows.length) throw new Error('No club found with slug conwy-golf-club');

  const geo = await geocodeAddress(ADDRESS);
  await pool.query(
    `UPDATE clubs SET address = $1, lat = COALESCE($2, lat), lng = COALESCE($3, lng) WHERE id = $4`,
    [ADDRESS, geo ? geo.lat : null, geo ? geo.lng : null, rows[0].id]
  );
  console.log(`Was: ${rows[0].address || '(blank)'}`);
  console.log(`Now: ${ADDRESS}`);
  console.log(geo ? `Coordinates: ${geo.lat}, ${geo.lng}` : 'Geocoding failed: coordinates left as they were.');
  await pool.end();
}

run().catch(err => {
  console.error('Update failed:', err.message);
  process.exit(1);
});
