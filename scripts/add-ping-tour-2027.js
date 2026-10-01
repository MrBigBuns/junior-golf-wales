// Adds the 2027 PING Welsh Junior Tour schedule (from Wales Golf's published
// table, Oct 2026). Events 1 and 5 are TBC and are not added until dated.
// Requires the organiser created by scripts/add-junior-series.js.
// Safe to re-run: clubs and events are upserted by slug.
// Run via the Render web shell: node scripts/add-ping-tour-2027.js
require('dotenv').config();
const pool = require('../db/pool');
const { geocodeAddress } = require('../lib/geocode');

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Addresses verified against Companies House / Visit Wales listings.
const clubs = {
  penrhos: {
    name: 'Penrhos Park Golf Club', region: 'Mid',
    address: 'Penrhos Golf & Country Club, Llanrhystud, Aberystwyth, Ceredigion, SY23 5AY',
    website: 'https://penrhospark.com/golf'
  },
  builth: {
    name: 'Builth Wells Golf Club', region: 'Mid',
    address: 'Golf Links Road, Builth Wells, Powys, LD2 3NF',
    website: null
  },
  swanseaBay: {
    name: 'Swansea Bay Golf Club', region: 'South',
    address: 'Jersey Marine, Neath, SA10 6JP',
    website: 'https://www.swanseabaygolfclub.co.uk'
  },
  caernarfon: {
    name: 'Caernarfon Golf Club', region: 'North',
    address: 'Aberforeshore, Llanfaglan, Caernarfon, Gwynedd, LL54 5RP',
    website: 'http://www.caernarfongolfclub.co.uk'
  },
  padeswood: {
    name: 'Padeswood & Buckley Golf Club', region: 'North',
    address: 'The Caia, Station Lane, Padeswood, Mold, Flintshire, CH7 4JD',
    website: 'http://www.padeswoodgolfclub.com'
  }
};

const events = [
  { title: 'PING Welsh Junior Tour Event 2', date: '2027-05-16', club: 'penrhos' },
  { title: 'PING Welsh Junior Tour Event 3', date: '2027-06-05', club: 'builth' },
  { title: 'PING Welsh Junior Tour Event 4', date: '2027-06-19', club: 'swanseaBay' },
  { title: 'PING Welsh Junior Tour Event 6', date: '2027-07-11', club: 'caernarfon' },
  { title: 'PING Welsh Junior Tour Final',   date: '2027-09-26', club: 'padeswood', final: true }
];

const TOUR_URL = 'https://www.walesgolf.org/ping-welsh-junior-tour';

async function upsertClub(c) {
  const geo = await geocodeAddress(c.address);
  const { rows } = await pool.query(
    `INSERT INTO clubs (name, slug, region, address, website, lat, lng)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (slug) DO UPDATE SET
       address = COALESCE(clubs.address, EXCLUDED.address),
       website = COALESCE(clubs.website, EXCLUDED.website),
       lat     = COALESCE(clubs.lat, EXCLUDED.lat),
       lng     = COALESCE(clubs.lng, EXCLUDED.lng)
     RETURNING id, name, lat, lng`,
    [c.name, slugify(c.name), c.region, c.address, c.website, geo?.lat ?? null, geo?.lng ?? null]
  );
  return rows[0];
}

async function run() {
  const { rows: org } = await pool.query(
    `SELECT id FROM organisers WHERE slug = 'ping-welsh-junior-tour'`
  );
  if (!org.length) {
    throw new Error('Organiser not found - run scripts/add-junior-series.js first.');
  }
  const organiserId = org[0].id;

  const clubIds = {};
  for (const [key, c] of Object.entries(clubs)) {
    const row = await upsertClub(c);
    clubIds[key] = row.id;
    console.log(`Club: ${row.name} (${row.lat ?? 'no lat'}, ${row.lng ?? 'no lng'})`);
  }

  for (const e of events) {
    const slug = slugify(`${e.title}-${clubs[e.club].name}-${e.date}`);
    const format = e.final
      ? 'Tour Final - qualification via the Order of Merit from regional events'
      : 'Regional tour event - counts towards the Order of Merit';

    const { rows } = await pool.query(
      `INSERT INTO events (title, slug, club_id, organiser_id, date_start, format, gender,
                           age_category, entry_url, source_url, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'Separate boys and girls categories', $7, $8, $8, 'confirmed', now())
       ON CONFLICT (slug) DO UPDATE SET
         club_id = EXCLUDED.club_id, organiser_id = EXCLUDED.organiser_id,
         format = EXCLUDED.format, gender = EXCLUDED.gender,
         age_category = EXCLUDED.age_category,
         entry_url = EXCLUDED.entry_url, source_url = EXCLUDED.source_url,
         status = 'confirmed', updated_at = now()
       RETURNING slug, (xmax = 0) AS inserted`,
      [
        e.title, slug, clubIds[e.club], organiserId, e.date, format,
        'Under 8 to Under 18 age groups',
        TOUR_URL
      ]
    );
    console.log(`${rows[0].inserted ? 'Added' : 'Updated'}: ${rows[0].slug}`);
  }

  console.log('PING Welsh Junior Tour 2027 loaded (Events 1 and 5 still TBC).');
  await pool.end();
}

run().catch(err => {
  console.error('Update failed:', err.message);
  process.exit(1);
});
