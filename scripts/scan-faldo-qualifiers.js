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
const DATA_URL = page =>
  `${DIRECTORY}/fetch_initial_data_for_directories?filter_options%5Btour%5D=all&filter_options%5BadvancedFiltersOn%5D=true&page=${page}`;
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
      // The directory only lists events when it is embedded on the Faldo site
      // (opened on its own it says "No events found"), so say where we came from
      'Referer': 'https://www.faldoseries.com/the-faldo-futures/',
      'Origin': 'https://www.faldoseries.com'
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

// First string under any key whose name matches, searching nested objects too
function pick(obj, keyRe, valueRe) {
  if (!obj || typeof obj !== 'object') return null;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && keyRe.test(k) && (!valueRe || valueRe.test(v))) return v;
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') {
      const found = pick(v, keyRe, valueRe);
      if (found) return found;
    }
  }
  return null;
}

const ISO = /\d{4}-\d{2}-\d{2}/;
function normalise(item) {
  const name = pick(item, /^(name|league_?name|title|display_?name)$/i);
  const start = pick(item, /start/i, ISO) || pick(item, /date/i, ISO);
  const close = pick(item, /(close|deadline|registration_?end|end)/i, ISO);
  const status = pick(item, /status/i);
  const url = pick(item, /(url|link|path)/i, /^https?:\/\//) || null;
  const id = item.id != null ? String(item.id) : (pick(item, /^(id|league_?id|slug)$/i) || null);
  return {
    id, name: name ? name.replace(/\s+/g, ' ').trim() : null,
    date: start ? start.match(ISO)[0] : null,
    closes: close && close !== start ? close.match(ISO)[0] : null,
    status, url
  };
}

async function loadAll() {
  if (FILE) return [JSON.parse(fs.readFileSync(FILE, 'utf8'))];
  const pages = [];
  for (let p = 1; p <= MAX_PAGES; p++) {
    const j = await fetchJson(DATA_URL(p));
    pages.push(j);
    if (!j.misc || j.misc.noMoreData || !(j.leagues && j.leagues.length)) break;
    await sleep(1000);
  }
  return pages;
}

async function run() {
  console.log(`Mode: ${SAVE ? 'SAVE' : 'dry run'}${FILE ? ` (file ${FILE})` : ''}`);
  const pages = await loadAll();
  const leagues = pages.flatMap(p => Array.isArray(p.leagues) ? p.leagues : []);
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
              entry_fee: '',
              entry_info: e.url || 'https://www.faldoseries.com/the-faldo-futures/',
              notes: `Faldo Futures qualifier (Golf Genius directory). Status: ${e.status || 'unknown'}.` +
                (e.closes ? ` Registration closes: ${e.closes}.` : '') +
                ` Fee is set by the host club. Series organiser id ${organisers[0] ? organisers[0].id : 'unknown'}.`,
              source: 'faldo-genius',
              source_id: e.id
            }),
            'faldo-import'
          ]
        );
        queued++;
      }
    }
    console.log(`  ${e.date || 'no date'} | ${e.name || 'no name'} | ${e.status || ''}${e.closes ? ` | closes ${e.closes}` : ''}  ${note}`);
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
