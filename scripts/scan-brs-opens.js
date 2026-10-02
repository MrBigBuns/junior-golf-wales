// Scans the BRS Golf open competitions listing for Wales and queues any
// junior events into the admin Submissions page for review.
//
// Usage (Render web shell):
//   node scripts/scan-brs-opens.js            dry run: print junior matches only
//   node scripts/scan-brs-opens.js --all      dry run: print every parsed result (parser check)
//   node scripts/scan-brs-opens.js --save     queue new junior matches as submissions
//
// Nothing is published automatically. Each match lands in /admin/submissions
// as "pending", and events already on the site (same club + date) or already
// queued (same BRS competition id) are skipped, so it is safe to re-run.
require('dotenv').config();
const { SITE_URL } = require('../lib/site');
const pool = require('../db/pool');

const BASE = 'https://www.brsgolf.com/opencomps';
const LIST_URL = page => `${BASE}/search/search?country_id=4&page=${page}`; // 4 = Wales
const DELAY_MS = 1500;
const MAX_PAGES = 40;
const JUNIOR_RE = /junior|juvenile|\byouth\b|\bboys\b|\bgirls\b|\bu-?1[0-8]s?\b|under[ -]?1[0-8]/i;

const args = new Set(process.argv.slice(2));
const SAVE = args.has('--save');
const SHOW_ALL = args.has('--all');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'WalesJuniorGolf/0.1 (junior event listings; contact via ' + SITE_URL + ')',
      'Accept-Language': 'en-GB'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  // Site serves ISO-8859-1; decode explicitly so the £ sign survives
  return new TextDecoder('iso-8859-1').decode(await res.arrayBuffer());
}

function decodeEntities(s) {
  return s
    .replace(/&pound;/g, '£').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function htmlToLines(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h\d|li|tr|td|strong|b|span|a)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const DATE_RE = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) (\d{1,2})(?:st|nd|rd|th) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/;
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function toIsoDate(line) {
  const m = line.match(DATE_RE);
  if (!m) return null;
  const mm = String(MONTHS.indexOf(m[3]) + 1).padStart(2, '0');
  return `${m[4]}-${mm}-${m[2].padStart(2, '0')}`;
}

// Each result ends with a "More Info" link to /competition/detail/?id=N.
// Split the page on those links and read each chunk's text lines, anchoring
// on the date line: club is the line before it, title and type follow it.
function parseResults(html) {
  const results = [];
  const linkRe = /competition\/detail\/\?id=(\d+)/g;
  let prevEnd = 0;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const chunk = html.slice(prevEnd, m.index);
    prevEnd = m.index + m[0].length;
    const id = m[1];
    if (results.some(r => r.id === id)) continue;

    const lines = htmlToLines(chunk);
    const di = lines.findIndex(l => DATE_RE.test(l));
    if (di < 1) continue;

    const after = lines.slice(di + 1);
    const priceLine = after.find(l => /Members:|Visitors:|£/.test(l)) || null;
    const bookMatch = html.slice(prevEnd, prevEnd + 600).match(/href="([^"]*opens_day\.php[^"]*)"/i);

    results.push({
      id,
      club: lines[di - 1],
      date: toIsoDate(lines[di]),
      title: after[0] || '',
      type: after[1] && after[1] !== priceLine ? after[1] : '',
      price: priceLine,
      detailUrl: `${BASE}/competition/detail/?id=${id}`,
      bookUrl: bookMatch ? decodeEntities(bookMatch[1]) : null
    });
  }
  return results;
}

function lastPage(html) {
  const m = html.match(/Page \d+ of (\d+)/);
  return m ? Math.min(Number(m[1]), MAX_PAGES) : 1;
}

function slugify(str) {
  return str.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function alreadyKnown(r) {
  const { rows: queued } = await pool.query(
    `SELECT 1 FROM submissions WHERE raw_data->>'source' = 'brs' AND raw_data->>'source_id' = $1 LIMIT 1`,
    [r.id]
  );
  if (queued.length) return 'already queued';
  const { rows: listed } = await pool.query(
    `SELECT 1 FROM events e JOIN clubs c ON c.id = e.club_id
     WHERE c.slug = $1 AND e.date_start = $2 LIMIT 1`,
    [slugify(r.club), r.date]
  );
  if (listed.length) return 'already on site';
  return null;
}

async function detailText(url) {
  try {
    const lines = htmlToLines(await get(url));
    const start = lines.findIndex(l => DATE_RE.test(l));
    return lines.slice(Math.max(0, start - 2), start + 40).join(' | ').slice(0, 1500);
  } catch (e) {
    return `(could not fetch detail page: ${e.message})`;
  }
}

async function run() {
  console.log(`Mode: ${SAVE ? 'SAVE' : 'dry run'}${SHOW_ALL ? ' (showing all results)' : ''}`);
  const first = await get(LIST_URL(1));
  const pages = lastPage(first);
  console.log(`Wales listing: ${pages} page(s)`);

  const all = [];
  for (let p = 1; p <= pages; p++) {
    const html = p === 1 ? first : await get(LIST_URL(p));
    const parsed = parseResults(html);
    all.push(...parsed);
    console.log(`Page ${p}: ${parsed.length} result(s)`);
    if (p < pages) await sleep(DELAY_MS);
  }

  if (SHOW_ALL) {
    all.forEach(r => console.log(`  ${r.date} | ${r.club} | ${r.title} | ${r.type} | ${r.price}`));
  }

  const juniors = all.filter(r => JUNIOR_RE.test(`${r.title} ${r.type}`));
  console.log(`\nParsed ${all.length} competitions, ${juniors.length} junior match(es):`);

  let queued = 0;
  for (const r of juniors) {
    const skip = await alreadyKnown(r);
    console.log(`  ${r.date} | ${r.club} | ${r.title} | ${r.type} | ${r.price || 'no price'}${skip ? `  [skip: ${skip}]` : ''}`);
    if (skip || !SAVE) continue;

    await sleep(DELAY_MS);
    const detail = await detailText(r.detailUrl);
    await pool.query(
      `INSERT INTO submissions (raw_data, submitted_by_email) VALUES ($1, $2)`,
      [
        JSON.stringify({
          event_title: r.title,
          club_name: r.club,
          event_date: r.date,
          entry_fee: r.price,
          entry_info: r.bookUrl || r.detailUrl,
          notes: `${r.type}. BRS listing: ${r.detailUrl}. Detail: ${detail}`,
          source: 'brs',
          source_id: r.id
        }),
        'brs-import'
      ]
    );
    queued++;
  }

  console.log(SAVE
    ? `\nQueued ${queued} new submission(s). Review at /admin/submissions.`
    : '\nDry run only. Re-run with --save to queue these for review.');
  await pool.end();
}

run().catch(async err => {
  console.error('Scan failed:', err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
