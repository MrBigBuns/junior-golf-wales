// Adds the South Wales golf clubs as club records (name + region only).
// Existing clubs are left untouched (matched by slug). Details such as
// address, website, logo and scorecard are filled in afterwards by
// scripts/enrich-clubs.js and reviewed at /admin/club-suggestions.
// Run via the Render web shell or locally: node scripts/add-south-wales-clubs.js
require('dotenv').config();
const pool = require('../db/pool');

function slugify(str) {
  return str.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Grouped by county for readability; all sit in the site's South region.
const CLUBS = {
  Pembrokeshire: ['Tenby Golf Club', 'Trefloyne Golf Club', 'South Pembrokeshire Golf Club', 'Haverfordwest Golf Club',
    'Milford Haven Golf Club', 'St Davids City Golf Club', 'Newport Links Golf Club'],
  Ceredigion: ['Cardigan Golf Club'],
  Carmarthenshire: ['Ashburnham Golf Club', 'Machynys Peninsula Golf Club', 'Carmarthen Golf Club', 'Derllys Court Golf Club',
    'Garnant Park Golf Club', 'Glynhir Golf Club', 'Glyn Abbey Golf Club', 'Saron Golf Club'],
  Swansea: ['Pennard Golf Club', 'Langland Bay Golf Club', 'Clyne Golf Club', 'Fairwood Park Golf Club', 'Gower Golf Club',
    'Morriston Golf Club', 'Pontardulais Golf Club', 'Mond Valley Golf Club'],
  'Neath Port Talbot': ['Neath Golf Club', 'Swansea Bay Golf Club', 'Lakeside (Margam) Golf Club', 'Glynneath Golf Club',
    'Pontardawe Golf Club'],
  Bridgend: ['Royal Porthcawl Golf Club', 'Pyle & Kenfig Golf Club', 'Southerndown Golf Club', 'Grove Golf Club',
    'Maesteg Golf Club', 'Coed-y-Mwstwr Golf Club'],
  'Rhondda Cynon Taf and Merthyr': ['Llantrisant & Pontyclun Golf Club', 'Pontypridd Golf Club', 'Rhondda Golf Club',
    'Aberdare Golf Club', 'Mountain Ash Golf Club', 'Morlais Castle Golf Club'],
  Cardiff: ['Cardiff Golf Club', 'Whitchurch Golf Club', 'Radyr Golf Club', 'Llanishen Golf Club', 'Creigiau Golf Club',
    'St Mellons Golf Club', 'Peterstone Lakes Golf Club'],
  'Vale of Glamorgan': ['Vale Resort', 'Cottrell Park Golf Club', 'Wenvoe Castle Golf Club', 'Dinas Powis Golf Club',
    'Glamorganshire Golf Club', 'Brynhill Golf Club', 'St Andrews Major Golf Club', 'St Athan Golf Club'],
  Caerphilly: ['Caerphilly Golf Club', 'Ridgeway Golf Club', 'Virginia Park Golf Club', 'Bargoed Golf Club',
    'Bryn Meadows Golf Club', 'Blackwood Golf Club'],
  'Torfaen and Blaenau Gwent': ['Pontypool Golf Club', 'Pontnewydd Golf Club', 'Greenmeadow Golf Club',
    'West Monmouthshire Golf Club'],
  Newport: ['Celtic Manor Resort', 'Newport Golf Club', 'Llanwern Golf Club', 'Parc Golf Club', 'Tredegar Park Golf Club',
    'Caerleon Golf Club'],
  Monmouthshire: ['St Pierre Golf & Country Club', 'Dewstow Golf Club', 'Monmouth Golf Club', 'Monmouthshire Golf Club',
    'Rolls of Monmouth Golf Club', 'Raglan Parc Golf Club', 'Wernddu Golf Club', 'Woodlake Park Golf Club',
    'Alice Springs Golf Club']
};

// Modern area -> golf county used by the site's county pages
const GOLF_COUNTY = {
  Pembrokeshire: 'Dyfed', Ceredigion: 'Dyfed', Carmarthenshire: 'Dyfed',
  Swansea: 'Glamorgan', 'Neath Port Talbot': 'Glamorgan', Bridgend: 'Glamorgan',
  'Rhondda Cynon Taf and Merthyr': 'Glamorgan', Cardiff: 'Glamorgan', 'Vale of Glamorgan': 'Glamorgan',
  Caerphilly: 'Glamorgan', 'Torfaen and Blaenau Gwent': 'Gwent', Newport: 'Gwent', Monmouthshire: 'Gwent'
};
// Clubs east of the Rhymney sit in historic Monmouthshire (Gwent)
const COUNTY_EXCEPTIONS = { 'Bryn Meadows Golf Club': 'Gwent', 'Blackwood Golf Club': 'Gwent' };

async function run() {
  let added = 0, existing = 0;
  for (const [county, names] of Object.entries(CLUBS)) {
    for (const name of names) {
      const { rows } = await pool.query(
        `INSERT INTO clubs (name, slug, region, county) VALUES ($1, $2, 'South', $3)
         ON CONFLICT (slug) DO UPDATE SET county = COALESCE(clubs.county, EXCLUDED.county)
         RETURNING (xmax = 0) AS inserted`,
        [name, slugify(name), COUNTY_EXCEPTIONS[name] || GOLF_COUNTY[county] || null]
      );
      if (rows[0] && rows[0].inserted) { added++; console.log(`Added: ${name} (${county})`); } else { existing++; }
    }
  }
  console.log(`\n${added} club(s) added, ${existing} already present.`);
  console.log('Next: node scripts/enrich-clubs.js --limit 10');
  await pool.end();
}

run().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
