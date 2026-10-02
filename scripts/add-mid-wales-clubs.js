// Adds the Mid Wales golf clubs as club records (name, region and county).
// Existing clubs are left untouched (matched by slug), apart from filling in
// a missing county. Details are then researched by scripts/enrich-clubs.js
// --region Mid and reviewed at /admin/club-suggestions.
// Run via the Render web shell or locally: node scripts/add-mid-wales-clubs.js
require('dotenv').config();
const pool = require('../db/pool');

function slugify(str) {
  return str.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Area -> golf county used by the site's county pages. Ceredigion sits in
// Dyfed and southern Gwynedd (Meirionnydd) in Gwynedd, but both are listed
// under Mid Wales on the site.
const AREAS = {
  Powys: {
    county: 'Powys',
    clubs: ['Brecon Golf Club', 'Cradoc Golf Club', 'Builth Wells Golf Club', 'Rhosgoch Golf Club',
      'Llandrindod Wells Golf Club', 'Knighton Golf Club', 'St Idloes Golf Club', 'St Giles Golf Club',
      'Welshpool Golf Club', 'Lakeside (Garthmyl) Golf Club', 'Machynlleth Golf Club', 'Old Rectory Golf Club']
  },
  Ceredigion: {
    county: 'Dyfed',
    clubs: ['Aberystwyth Golf Club', 'Borth & Ynyslas Golf Club', 'Cilgwyn Golf Club', 'Penrhos Park Golf Club']
  },
  Meirionnydd: {
    county: 'Gwynedd',
    clubs: ['Aberdovey Golf Club', 'Dolgellau Golf Club', 'Bala Golf Club']
  }
};

async function run() {
  let added = 0, existing = 0;
  for (const [area, { county, clubs }] of Object.entries(AREAS)) {
    for (const name of clubs) {
      const { rows } = await pool.query(
        `INSERT INTO clubs (name, slug, region, county) VALUES ($1, $2, 'Mid', $3)
         ON CONFLICT (slug) DO UPDATE SET county = COALESCE(clubs.county, EXCLUDED.county)
         RETURNING (xmax = 0) AS inserted`,
        [name, slugify(name), county]
      );
      if (rows[0] && rows[0].inserted) { added++; console.log(`Added: ${name} (${area})`); } else { existing++; }
    }
  }
  console.log(`\n${added} club(s) added, ${existing} already present.`);
  console.log('Next: node scripts/enrich-clubs.js --region Mid --limit 10');
  await pool.end();
}

run().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
