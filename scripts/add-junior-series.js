// Adds the Wales Mini Masters and PING Welsh Junior Tour as organisers (series),
// plus the 2026 Wales Mini Masters Final at Royal St. David's.
// Sources: walesminimasters.co.uk/9-hole-event (Oct 2026), Wales Golf press coverage.
// Safe to re-run: everything is upserted by slug.
// Run via the Render web shell: node scripts/add-junior-series.js
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

const organisers = [
  {
    name: 'Wales Mini Masters',
    website: 'https://www.walesminimasters.co.uk',
    description: 'Beginner-friendly series for under-18s who are new to golf: not club members, or members without a handicap below 28 (a separate category covers handicaps 14 to 28). Nine-hole qualifying rounds around Wales, each player accompanied by an adult, building to an invitation-only Final. Entry is around £8 per qualifying round. The 2027 schedule is usually published in the spring.'
  },
  {
    name: 'PING Welsh Junior Tour',
    website: 'https://www.walesgolf.org/ping-welsh-junior-tour',
    description: 'Wales Golf\u2019s national junior tour, with regional events around Wales from Under 8s to Under 18s, separate boys\u2019 and girls\u2019 categories, and an Order of Merit leading to a Tour Final. Younger age groups play modified Stableford and do not need an official handicap. Dates for the coming season are published by Wales Golf.'
  }
];

async function upsertOrganiser(o) {
  const { rows } = await pool.query(
    `INSERT INTO organisers (name, slug, description, website)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name, description = EXCLUDED.description, website = EXCLUDED.website
     RETURNING id, slug`,
    [o.name, slugify(o.name), o.description, o.website]
  );
  return rows[0];
}

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
  const ids = {};
  for (const o of organisers) {
    const row = await upsertOrganiser(o);
    ids[o.name] = row.id;
    console.log(`Organiser: ${o.name} -> /tours/${row.slug}`);
  }

  const club = await upsertClub({
    name: "Royal St. David's Golf Club",
    region: 'North',
    address: 'Harlech, Gwynedd, LL46 2UB',
    website: 'https://www.royalstdavids.co.uk'
  });
  console.log(`Club: ${club.name} (${club.lat ?? 'no lat'}, ${club.lng ?? 'no lng'})`);

  const title = 'Wales Mini Masters Final';
  const date = '2026-10-11';
  const slug = slugify(`${title}-${club.name}-${date}`);

  const { rows } = await pool.query(
    `INSERT INTO events (title, slug, club_id, organiser_id, date_start, format, gender,
                         age_category, hcp_index_limit, accompanying_adult_required,
                         prizes, entry_url, source_url, status, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'Any Gender', $7, $8, true, $9, $10, $11, 'confirmed', now())
     ON CONFLICT (slug) DO UPDATE SET
       club_id = EXCLUDED.club_id, organiser_id = EXCLUDED.organiser_id,
       format = EXCLUDED.format, age_category = EXCLUDED.age_category,
       hcp_index_limit = EXCLUDED.hcp_index_limit,
       accompanying_adult_required = true, prizes = EXCLUDED.prizes,
       entry_url = EXCLUDED.entry_url, source_url = EXCLUDED.source_url,
       status = 'confirmed', updated_at = now()
     RETURNING slug, (xmax = 0) AS inserted`,
    [
      title, slug, club.id, ids['Wales Mini Masters'], date,
      'Series final, by invitation only (qualifying-round category winners plus best runners-up)',
      'Under 18: 7 & under, 8-9, 10-11, 12+ (school year), boys and girls',
      'No handicap or 28+ (9-hole); 14 to 28 (handicap category)',
      'Volvik Challenge Champion crowned at the Final.',
      'https://www.walesminimasters.co.uk/9-hole-event/',
      'https://www.walesminimasters.co.uk/9-hole-event/'
    ]
  );
  console.log(`${rows[0].inserted ? 'Added' : 'Updated'}: ${rows[0].slug}`);

  console.log('Junior series loaded.');
  await pool.end();
}

run().catch(err => {
  console.error('Update failed:', err.message);
  process.exit(1);
});
