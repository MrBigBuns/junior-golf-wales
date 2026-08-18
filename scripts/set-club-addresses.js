// Backfills real addresses (sourced from club websites / GolfPass / Companies
// House filings) for the clubs that only had name+region from the original
// CSV seed, then geocodes each via lib/geocode.js (Postcodes.io primary,
// Nominatim fallback). Run via the Render web shell:
//   node scripts/set-club-addresses.js
require('dotenv').config();
const pool = require('../db/pool');
const { geocodeAddress } = require('../lib/geocode');

const clubs = [
  { slug: 'vale-of-llangollen-golf-club', address: 'Holyhead Road, Llangollen, Denbighshire, LL20 7PR' },
  { slug: 'wrexham-golf-club', address: 'Holt Road, Wrexham, LL13 9SB' },
  { slug: 'st-melyd-golf-club', address: 'The Paddock, Meliden Road, Prestatyn, Denbighshire, LL19 8NB' },
  { slug: 'abergele-golf-club', address: 'Tan-y-Gopa Road, Abergele, Conwy, LL22 8DS' },
  { slug: 'cardiff-golf-club', address: 'Sherborne Avenue, Cyncoed, Cardiff, CF23 6SJ' },
  { slug: 'conwy-golf-club', address: 'Beacons Way, Morfa, Conwy, LL32 8ER' },
  { slug: 'llandudno-maesdu-golf-club', address: 'Hospital Road, Llandudno, LL30 1HU' },
  { slug: 'neath-golf-club', address: 'Cwmbach Road, Cadoxton, Neath, SA10 8AH' },
  { slug: 'royal-porthcawl-golf-club', address: 'Rest Bay, Porthcawl, CF36 3UW' },
  { slug: 'ashburnham-golf-club', address: 'Cliff Terrace, Burry Port, Carmarthenshire, SA16 0HN' }
];

async function run() {
  for (const club of clubs) {
    const { rows } = await pool.query(`SELECT id, name FROM clubs WHERE slug = $1`, [club.slug]);
    if (!rows.length) {
      console.log(`✗ No club found for slug "${club.slug}" — skipping`);
      continue;
    }

    const geo = await geocodeAddress(club.address);
    await pool.query(
      `UPDATE clubs SET address = $1, lat = $2, lng = $3 WHERE id = $4`,
      [club.address, geo ? geo.lat : null, geo ? geo.lng : null, rows[0].id]
    );

    console.log(
      geo
        ? `✓ ${rows[0].name}: ${club.address} → ${geo.lat}, ${geo.lng}`
        : `⚠ ${rows[0].name}: address set, but geocoding failed for "${club.address}"`
    );
  }

  await pool.end();
}

run().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
