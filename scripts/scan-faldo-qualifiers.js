// Lists every Faldo Futures qualifier in the series' Golf Genius directory,
// shows which Welsh ones we already have, and queues the missing Welsh ones
// into the admin Submissions page for review.
//
// Usage (Render web shell):
//   node scripts/scan-faldo-qualifiers.js            dry run: print every event found
//   node scripts/scan-faldo-qualifiers.js --raw      print the first raw record (parser check)
//   node scripts/scan-faldo-qualifiers.js --save     queue new Welsh events as submissions
//   node scripts/scan-faldo-qualifiers.js --file x.json   read a saved copy of the data
//
// Nothing is published automatically. Events already on the site (same club +
// date) or already queued (same Golf Genius id) are skipped, so it is safe to
// re-run. Events at clubs we don't hold are listed as "not a known Welsh club"
// so nothing is hidden: if one is really Welsh, add the club first.
require('dotenv').config();
const fs = require('fs');
const pool = require('../db/pool');

const DIRECTORY = 'https://www.golfgenius.com/leagues/8621276101123018309/v2_customer_directories/13187760618590998347';
// The directory is embedded on the Faldo site for the 2027 season; this is the
// request the embed makes (events come back 20 at a time, keyed by event id)
const SEASON_ID = '12549381471338532540';
const STATUSES = ['my_registrations', 'registration_open', 'past_events', 'upcoming_events'];
const DATA_URL = page => {
  const p = new URLSearchParams();
  p.set('filters', 'show'); p.set('header', 'false'); p.set('leaderboards', 'false');
  p.set('season_id', SEASON_ID); p.set('sort', 'descending');
  p.set('filter_options[leagueName]', '');
  STATUSES.forEach(s => p.append('filter_options[status][]', s));
  p.set('filter_options[tour]', 'all'); p.set('filter_options[startDate]', ''); p.set('filter_options[endDate]', '');
  p.set('filter_options[location][coords][lat]', ''); p.set('filter_options[location][coords][lng]', '');
  p.set('filter_options[location][radius]', ''); p.set('filter_options[currentLocation]', '');
  p.set('filter_options[viewType]', 'condensed'); p.set('filter_options[advancedFiltersOn]', 'true');
  STATUSES.forEach(s => p.append('filter_options[defaultStatusFilters][]', s));
  p.set('selected_tour_id', ''); p.set('page', String(page));
  return `${DIRECTORY}/fetch_initial_data_for_directories?${p.toString()}`;
};
const MAX_PAGES = 20;

const argv = process.argv.slice(2);
const SAVE = argv.includes('--save');
const RAW = argv.includes('--raw');
const fileIdx = argv.indexOf('--file');
const FILE = fileIdx >= 0 ? argv[fileIdx + 1] : null;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'WalesJuniorGolf/0.1 (junior event listings)',
      'Referer': 'https://www.faldoseries.com/the-faldo-futures/'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for the directory data`);
  return res.json();
}

// "Swansea Bay GC", "Swansea Bay Golf Club" and "Swansea Bay" all give "swanseabay"
const clubKey = s => String(s || '').toLowerCase()
  .replace(/&/g, 'and')
  .replace(/\b(golf\s*(club|course|links|&\s*country\s*club)|g\.?c\.?|country club|resort)\b/g, ' ')
  .replace(/[^a-z0-9]/g, '');
const shortName = s => String(s || '').replace(/\s+(Golf\s+(Club|Course|Links)|GC|G\.C\.)\s*$/i, '').trim();
const titleCase = s => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());

const ISO = /\d{4}-\d{2}-\d{2}/;
function normalise(l) {
  const info = l.registrationInfo || {};
  const type = Array.isArray(l.registrationTypes) ? l.registrationTypes[0] : null;
  const fee = type && type.priceText ? (type.priceText.match(/£\s?(\d+(?:\.\d+)?)/) || [])[1] : null;
  const day = v => (v && String(v).match(ISO) ? String(v).match(ISO)[0] : null);
  return {
    id: l.id != null ? String(l.id) : null,
    name: l.name ? String(l.name).replace(/\s+/g, ' ').trim() : null,
    date: day(l.startDate),
    opens: day(info.starts_at),
    closes: day(info.ends_at),
    status: info.status || null,
    fee: fee ? Number(fee) : null,
    url: l.id != null ? `https://www.golfgenius.com/register?league_id=${l.id}` : null
  };
}

async function loadAll() {
  if (FILE) return [JSON.parse(fs.readFileSync(FILE, 'utf8'))];
  const pages = [];
  for (let p = 1; p <= MAX_PAGES; p++) {
    const j = await fetchJson(DATA_URL(p));
    pages.push(j);
    if (!j.misc || j.misc.noMoreData || !Object.keys(j.leagues || {}).length) break;
    await sleep(1000);
  }
  return pages;
}

async function run() {
  console.log(`Mode: ${SAVE ? 'SAVE' : 'dry run'}${FILE ? ` (file ${FILE})` : ''}`);
  const pages = await loadAll();
  const leagues = pages.flatMap(p => Object.values(p.leagues || {}));
  console.log(`Directory: ${(pages[0].misc && pages[0].misc.directoryName) || 'unknown'}, ${leagues.length} event(s) returned`);

  if (RAW) {
    console.log(JSON.stringify(leagues[0] || pages[0], null, 2).slice(0, 3000));
    await pool.end();
    return;
  }
  if (!leagues.length) {
    console.log('\nNo events returned. The directory may need its status filter, or its data may load another way.');
    console.log('Run with --raw to see what came back, and check the directory page by hand.');
    await pool.end();
    return;
  }

  const { rows: clubs } = await pool.query(`SELECT id, name, slug FROM clubs WHERE archived_at IS NULL`);
  const byKey = new Map(clubs.map(c => [clubKey(c.name), c]));
  const { rows: organisers } = await pool.query(`SELECT id FROM organisers WHERE name = 'Faldo Futures'`);

  const events = leagues.map(normalise).filter(e => e.name || e.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  let welsh = 0, queued = 0, unmatched = 0;
  for (const e of events) {
    const club = byKey.get(clubKey(e.name)) || null;
    let note = '';
    if (!club) {
      unmatched++;
      note = '[not a known Welsh club]';
    } else {
      welsh++;
      const { rows: listed } = await pool.query(
        `SELECT id FROM events WHERE club_id = $1 AND date_start = $2 LIMIT 1`, [club.id, e.date]);
      const { rows: inQueue } = await pool.query(
        `SELECT 1 FROM submissions WHERE raw_data->>'source' = 'faldo-genius' AND raw_data->>'source_id' = $1 LIMIT 1`, [e.id]);
      if (listed.length) note = `[already on site: event ${listed[0].id}]`;
      else if (inQueue.length) note = '[already queued]';
      else note = SAVE ? '[queued]' : '[NEW: would queue]';

      if (note === '[queued]') {
        await pool.query(
          `INSERT INTO submissions (raw_data, submitted_by_email) VALUES ($1, $2)`,
          [
            JSON.stringify({
              event_title: `Faldo Futures Qualifier: ${titleCase(shortName(e.name))}`,
              club_name: club.name,
              event_date: e.date,
              entry_fee: e.fee != null ? `£${e.fee}` : '',
              entry_info: e.url || 'https://www.faldoseries.com/the-faldo-futures/',
              notes: `Faldo Futures qualifier (Golf Genius directory). Registration: ${e.status || 'unknown'}.` +
                (e.opens ? ` Opened ${e.opens}.` : '') + (e.closes ? ` Closes ${e.closes}.` : '') +
                (e.fee == null ? ' Fee not shown (set by the host club).' : '') +
                ` Series organiser id ${organisers[0] ? organisers[0].id : 'unknown'}.`,
              source: 'faldo-genius',
              source_id: e.id
            }),
            'faldo-import'
          ]
        );
        queued++;
      }
    }
    console.log(`  ${e.date || 'no date'} | ${e.name || 'no name'} | ${e.status || ''}${e.fee != null ? ` | £${e.fee}` : ''}${e.closes ? ` | closes ${e.closes}` : ''}  ${note}`);
  }

  console.log(`\n${events.length} event(s) in the directory: ${welsh} at Welsh clubs we hold, ${unmatched} elsewhere.`);
  console.log(SAVE
    ? `Queued ${queued} new submission(s). Review at /admin/submissions.`
    : 'Dry run only. Re-run with --save to queue the NEW ones for review.');
  await pool.end();
}

run().catch(async err => {
  console.error('Scan failed:', err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
