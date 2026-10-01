// Adds/updates the 2027 Junior Opens at Ashburnham, Whitchurch, Abergele and
// Conwy with full detail (sourced from Golf Empire listings, Oct 2026).
// Safe to re-run: clubs and events are upserted by slug.
// Run via the Render web shell: node scripts/add-2027-junior-opens.js
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

const events = [
  {
    club: {
      name: 'Ashburnham Golf Club',
      region: 'South',
      address: 'Cliff Terrace, Burry Port, Carmarthenshire, SA16 0HN',
      website: 'https://ashburnhamgolfclub.co.uk',
      description: 'Championship links founded in 1894 on Carmarthen Bay, originally laid out by J.H. Taylor. Has hosted the Welsh Open Strokeplay, the PGA Championship and the Home Internationals.'
    },
    title: 'Junior Open',
    date: '2027-07-27',
    startTime: '10:00',
    format: 'Individual Strokeplay',
    hcpIndexLimit: '28.0 (boys) 36.0 (girls)',
    ageCategory: 'Juniors',
    entryFee: 10.00,
    feeTiers: [
      { label: 'Member', amount: 5.00 },
      { label: 'Visitor', amount: 10.00 }
    ],
    entryUrl: 'https://visitors.brsgolf.com/ashburnhamgc#/open-competitions/29/teesheet',
    sourceUrl: 'https://www.golfempire.co.uk/new/entryform.php?eventid=21920',
    yardage: 6945,
    par: 72,
    juniorTeesNote: 'Yardage/par shown is from the back tees; juniors will likely play shorter tees, check with the club.',
    catering: null,
    prizes: null,
    hcpAllowanceInfo: null
  },
  {
    club: {
      name: 'Whitchurch Golf Club',
      region: 'South',
      address: 'Pantmawr Road, Whitchurch, Cardiff, CF14 7TD',
      website: 'https://www.whitchurchcardiffgolfclub.co.uk',
      description: 'Parkland course founded in 1914, three and a half miles north of Cardiff city centre on elevated ground overlooking the capital. Noted for its testing par 3s and par 4s.'
    },
    title: "Junior Open - 'Ben Williams Trophy'",
    date: '2027-08-02',
    startTime: null,
    format: 'Individual Strokeplay (formats vary by age and handicap)',
    hcpIndexLimit: '54.0 (boys) 54.0 (girls)',
    ageCategory: 'Under 18 on 1 January 2027',
    entryFee: 15.00,
    feeTiers: null,
    entryUrl: 'https://opens.whitchurchcardiffgolfclub.co.uk/opens',
    sourceUrl: 'https://opens.whitchurchcardiffgolfclub.co.uk/opens',
    yardage: 6278,
    par: 71,
    juniorTeesNote: "men's course yardage shown; juniors play White, Yellow or Blue tees by playing handicap.",
    catering: 'Post-round meal included.',
    prizes: 'Nearest-the-pin challenges.',
    hcpAllowanceInfo: 'Tees by playing handicap: White up to 20, Yellow 21 to 36, Blue 36 to 54 (as published by the club). Tees and formats vary by age and handicap.'
  },
  {
    club: {
      name: 'Abergele Golf Club',
      region: 'North',
      address: 'Tan-y-Gopa Road, Abergele, Conwy, LL22 8DS',
      website: null,
      description: null
    },
    title: "Junior Open - 'Open Week'",
    date: '2027-08-24',
    startTime: '08:00',
    format: 'Individual Strokeplay',
    hcpIndexLimit: '28.0 (boys) 36.0 (girls)',
    ageCategory: 'Juniors 18 & under',
    entryFee: 10.00,
    feeTiers: null,
    entryUrl: 'https://visitors.brsgolf.com/abergele/#/open-competitions/155/teesheet',
    sourceUrl: 'https://www.golfempire.co.uk/new/entryform.php?eventid=15802',
    yardage: null,
    par: null,
    juniorTeesNote: null,
    catering: null,
    prizes: null,
    hcpAllowanceInfo: null
  },
  {
    club: {
      name: 'Conwy Golf Club',
      region: 'North',
      address: 'Beacons Way, Morfa, Conwy, LL32 8ER',
      website: null,
      description: null
    },
    title: 'Junior Open',
    date: '2027-08-25',
    startTime: '10:00',
    format: 'Individual Strokeplay',
    hcpIndexLimit: '36.0 (boys) 36.0 (girls)',
    ageCategory: 'Juniors',
    entryFee: 30.00,
    feeTiers: [
      { label: 'Member', amount: 15.00 },
      { label: 'Visitor', amount: 30.00 }
    ],
    entryUrl: 'https://visitors.brsgolf.com/conwy#/open-competitions/436/teesheet',
    sourceUrl: 'https://www.golfempire.co.uk/new/entryform.php?eventid=23023',
    yardage: null,
    par: null,
    juniorTeesNote: 'White tees (boys), red tees (girls).',
    catering: null,
    prizes: 'Run with the Justin Rose & Daily Telegraph Junior Championship. Best gross and nett scores from the leading boy and girl go forward, with potential to qualify for the finals at Quinta do Lago, Portugal. Prize presentation after the last group finishes.',
    hcpAllowanceInfo: 'Handicap qualifier: all players must have a handicap index of 36.0 or less. Not open to iGolfers.'
  }
];

async function upsertClub(c) {
  const slug = slugify(c.name);
  const geo = await geocodeAddress(c.address);
  const { rows } = await pool.query(
    `INSERT INTO clubs (name, slug, region, address, website, description, lat, lng)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (slug) DO UPDATE SET
       region      = EXCLUDED.region,
       address     = COALESCE(clubs.address, EXCLUDED.address),
       website     = COALESCE(EXCLUDED.website, clubs.website),
       description = COALESCE(EXCLUDED.description, clubs.description),
       lat         = COALESCE(clubs.lat, EXCLUDED.lat),
       lng         = COALESCE(clubs.lng, EXCLUDED.lng)
     RETURNING id, name`,
    [c.name, slug, c.region, c.address, c.website, c.description, geo?.lat ?? null, geo?.lng ?? null]
  );
  return rows[0];
}

async function run() {
  for (const e of events) {
    const club = await upsertClub(e.club);
    // Slug keyed on 'Junior Open' so it matches rows created by seed.js
    const slug = slugify(`Junior Open-${e.club.name}-${e.date}`);

    const { rows } = await pool.query(
      `INSERT INTO events (title, slug, club_id, date_start, start_time, format, holes,
                           gender, hcp_index_limit, age_category, entry_fee, entry_fee_tiers,
                           entry_url, source_url, yardage, par, junior_tees_note,
                           catering, prizes, hcp_allowance_info, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 18, 'Any Gender', $7, $8, $9, $10,
               $11, $12, $13, $14, $15, $16, $17, $18, 'confirmed', now())
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title, club_id = EXCLUDED.club_id, start_time = EXCLUDED.start_time,
         format = EXCLUDED.format, holes = EXCLUDED.holes, gender = EXCLUDED.gender,
         hcp_index_limit = EXCLUDED.hcp_index_limit, age_category = EXCLUDED.age_category,
         entry_fee = EXCLUDED.entry_fee, entry_fee_tiers = EXCLUDED.entry_fee_tiers,
         entry_url = EXCLUDED.entry_url, source_url = EXCLUDED.source_url,
         yardage = COALESCE(EXCLUDED.yardage, events.yardage),
         par = COALESCE(EXCLUDED.par, events.par),
         junior_tees_note = EXCLUDED.junior_tees_note, catering = EXCLUDED.catering,
         prizes = EXCLUDED.prizes, hcp_allowance_info = EXCLUDED.hcp_allowance_info,
         status = 'confirmed', updated_at = now()
       RETURNING slug, (xmax = 0) AS inserted`,
      [
        e.title, slug, club.id, e.date, e.startTime, e.format,
        e.hcpIndexLimit, e.ageCategory, e.entryFee,
        e.feeTiers ? JSON.stringify(e.feeTiers) : null,
        e.entryUrl, e.sourceUrl, e.yardage, e.par, e.juniorTeesNote,
        e.catering, e.prizes, e.hcpAllowanceInfo
      ]
    );
    console.log(`${rows[0].inserted ? 'Added' : 'Updated'}: ${rows[0].slug} (${club.name})`);
  }

  console.log('2027 junior opens loaded.');
  await pool.end();
}

run().catch(err => {
  console.error('Update failed:', err.message);
  process.exit(1);
});
