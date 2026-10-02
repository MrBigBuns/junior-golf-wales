// Adds the North Wales golf clubs as club records (name, region and county).
// Existing clubs are left untouched (matched by slug), apart from filling in
// a missing county. Details are then researched by scripts/enrich-clubs.js
// --region North and reviewed at /admin/club-suggestions.
// Run via the Render web shell or locally: node scripts/add-north-wales-clubs.js
require('dotenv').config();
const pool = require('../db/pool');

function slugify(str) {
  return str.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Golf county follows the preserved counties: Anglesey, Gwynedd and the
// western half of Conwy (Llandudno, Conwy, Betws-y-Coed) are Gwynedd;
// Denbighshire, Flintshire, Wrexham and eastern Conwy (Colwyn Bay,
// Abergele) are Clwyd.
const AREAS = {
  Anglesey: {
    county: 'Gwynedd',
    clubs: ['Anglesey Golf Club', 'Baron Hill Golf Club', 'Bull Bay Golf Club', 'Henllys Golf Club',
      'Holyhead Golf Club', 'Llangefni Golf Club', 'Storws Wen Golf Club']
  },
  Gwynedd: {
    county: 'Gwynedd',
    clubs: ["Royal St. David's Golf Club", 'Abersoch Golf Club', 'Nefyn & District Golf Club', 'Pwllheli Golf Club',
      'Porthmadog Golf Club', 'Criccieth Golf Club', 'Ffestiniog Golf Club', 'Caernarfon Golf Club',
      'St Deiniol Golf Club', 'Tyddyn Mawr Golf Club', 'Llyn Golf Club', 'Penmaenmawr Golf Club',
      'Llanfairfechan Golf Club']
  },
  'Conwy (west)': {
    county: 'Gwynedd',
    clubs: ['Conwy Golf Club', 'North Wales Golf Club', 'Llandudno (Maesdu) Golf Club', 'Betws-y-Coed Golf Club']
  },
  'Conwy (east)': {
    county: 'Clwyd',
    clubs: ['Abergele Golf Club', 'Rhos-on-Sea Golf Club', 'Old Colwyn Golf Club']
  },
  Denbighshire: {
    county: 'Clwyd',
    clubs: ['Denbigh Golf Club', 'Bryn Morfydd Golf Club', 'Kinmel Park Golf Club', 'Prestatyn Golf Club',
      'Rhuddlan Golf Club', 'Rhyl Golf Club', 'Ruthin-Pwllglas Golf Club', 'St. Melyd Golf Club',
      'Vale of Llangollen Golf Club']
  },
  Flintshire: {
    county: 'Clwyd',
    clubs: ['Mold Golf Club', 'Northop Golf Club', 'Hawarden Golf Club', 'Old Padeswood Golf Club',
      'Padeswood & Buckley Golf Club', 'Flint Golf Club', 'Holywell Golf Club', 'Nine of Clubs Golf Club',
      'Wepre Golf Club', 'Pennant Park Golf Club', 'Kinsale Golf Club']
  },
  Wrexham: {
    county: 'Clwyd',
    clubs: ['Wrexham Golf Club', 'Clays Golf Club', 'Plassey Golf Club', 'Moss Valley Golf Club', 'Chirk Golf Club']
  }
};

async function run() {
  let added = 0, existing = 0;
  for (const [area, { county, clubs }] of Object.entries(AREAS)) {
    for (const name of clubs) {
      const { rows } = await pool.query(
        `INSERT INTO clubs (name, slug, region, county) VALUES ($1, $2, 'North', $3)
         ON CONFLICT (slug) DO UPDATE SET county = COALESCE(clubs.county, EXCLUDED.county)
         RETURNING (xmax = 0) AS inserted`,
        [name, slugify(name), county]
      );
      if (rows[0] && rows[0].inserted) { added++; console.log(`Added: ${name} (${area})`); } else { existing++; }
    }
  }
  console.log(`\n${added} club(s) added, ${existing} already present.`);
  console.log('Next: node scripts/enrich-clubs.js --region North --limit 10');
  await pool.end();
}

run().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
