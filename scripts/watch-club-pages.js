// Weekly check of every club's open competitions page and junior page.
// Records lines that appeared or disappeared at /admin/page-changes.
//
// Only "relevant" lines are compared (dates, opens, juniors, entry fees...),
// so course-status banners, weather widgets and cookie notices don't cause
// false alerts. The first check of a page just records it (no change shown).
// Pages built in JavaScript (e.g. BRS listings, URLs with #/) can't be read
// this way and are skipped; the BRS opens scanner covers those.
//
//   node scripts/watch-club-pages.js            check all pages
//   node scripts/watch-club-pages.js --club conwy-golf-club
//   node scripts/watch-club-pages.js --dry-run  report, save nothing
require('dotenv').config();
const pool = require('../db/pool');

const argv = process.argv.slice(2);
const opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const ONE = opt('--club');
const DRY_RUN = argv.includes('--dry-run');
const DELAY_MS = 1200;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9'
};

async function fetchPage(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: HEADERS });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const type = res.headers.get('content-type') || '';
    if (!/html/i.test(type)) return { error: `not a web page (${type.split(';')[0] || 'unknown'})` };
    return { html: await res.text() };
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'timed out' : e.message };
  } finally {
    clearTimeout(t);
  }
}

// Pages that render in the browser: nothing useful in the raw HTML
function unreadable(url) {
  return /#\//.test(url) || /visitors\.brsgolf\.com|members\.brsgolf\.com/i.test(url);
}

const MONTH = '(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)';
const DATE = new RegExp(`\\b\\d{1,2}(st|nd|rd|th)?\\s+${MONTH}\\b|\\b${MONTH}\\s+\\d{1,2}(st|nd|rd|th)?\\b|\\b\\d{1,2}[/.]\\d{1,2}[/.]\\d{2,4}\\b|\\b(mon|tues|wednes|thurs|fri|satur|sun)day\\b`, 'i');
const KEYWORD = /\b(opens?|junior|juniors|youth|boys|girls|championship|competition|trophy|cup|stableford|medal|strokeplay|fourball|4bbb|scramble|am-?am|pro-?am|entry|entries|closing date|handicap limit)\b|£\s?\d/i;
const NOISE = /\b(course (is )?(open|closed)|course status|preferred lies|temporary greens|buggies|trolleys|weather|°c|forecast|cookie|privacy|copyright|©|all rights reserved|last updated|log ?in|sign ?in|subscribe|newsletter)\b/i;

function relevantLines(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(nav|header|footer)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d|td|th|section|article|span|a)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&pound;/g, '£').replace(/&#0?39;|&rsquo;/g, "'").replace(/&[a-z]+;/g, ' ');
  const seen = new Set();
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (line.length < 6 || line.length > 220) continue;
    if (NOISE.test(line)) continue;
    if (!DATE.test(line) && !KEYWORD.test(line)) continue;
    seen.add(line);
    if (seen.size >= 400) break;
  }
  return [...seen];
}

async function run() {
  const params = [];
  let filter = '';
  if (ONE) { params.push(ONE); filter = 'AND c.slug = $1'; }
  const { rows: pages } = await pool.query(
    `SELECT c.id AS club_id, c.name, 'opens' AS kind, c.opens_url AS url FROM clubs c
      WHERE c.archived_at IS NULL AND c.opens_url IS NOT NULL ${filter}
     UNION ALL
     SELECT c.id, c.name, 'juniors', c.juniors_url FROM clubs c
      WHERE c.archived_at IS NULL AND c.juniors_url IS NOT NULL ${filter}
     ORDER BY 2, 3`,
    params
  );
  // Forget watches whose club or URL changed, so the new page starts fresh
  if (!DRY_RUN && !ONE) {
    await pool.query(
      `DELETE FROM page_watch w WHERE NOT EXISTS (
         SELECT 1 FROM clubs c WHERE c.id = w.club_id AND c.archived_at IS NULL
           AND ((w.kind = 'opens' AND c.opens_url = w.url) OR (w.kind = 'juniors' AND c.juniors_url = w.url)))`
    );
  }

  let checked = 0, baselined = 0, changed = 0, skipped = 0, failed = 0;
  for (const p of pages) {
    const label = `${p.name} (${p.kind})`;
    if (unreadable(p.url)) { skipped++; continue; }

    const { rows: prevRows } = await pool.query(
      `SELECT id, url, lines FROM page_watch WHERE club_id = $1 AND kind = $2`, [p.club_id, p.kind]
    );
    const prev = prevRows[0] && prevRows[0].url === p.url ? prevRows[0] : null;

    const page = await fetchPage(p.url);
    if (!page.html) {
      failed++;
      console.log(`${label}: failed (${page.error})`);
      if (!DRY_RUN) {
        await pool.query(
          `INSERT INTO page_watch (club_id, kind, url, checked_at, last_error) VALUES ($1, $2, $3, now(), $4)
           ON CONFLICT (club_id, kind) DO UPDATE SET url = EXCLUDED.url, checked_at = now(), last_error = EXCLUDED.last_error,
             lines = CASE WHEN page_watch.url = EXCLUDED.url THEN page_watch.lines ELSE NULL END`,
          [p.club_id, p.kind, p.url, page.error]
        );
      }
      await sleep(DELAY_MS);
      continue;
    }
    checked++;
    const lines = relevantLines(page.html);

    if (!prev || !Array.isArray(prev.lines)) {
      baselined++;
      console.log(`${label}: first check, ${lines.length} relevant line(s) recorded`);
    } else {
      const before = new Set(prev.lines);
      const now = new Set(lines);
      const added = lines.filter(l => !before.has(l));
      const removed = prev.lines.filter(l => !now.has(l));
      if (added.length || removed.length) {
        changed++;
        console.log(`${label}: CHANGED (+${added.length} / -${removed.length})`);
        added.slice(0, 5).forEach(l => console.log(`   + ${l}`));
        if (!DRY_RUN) {
          await pool.query(
            `INSERT INTO page_changes (club_id, kind, url, added, removed) VALUES ($1, $2, $3, $4, $5)`,
            [p.club_id, p.kind, p.url, JSON.stringify(added.slice(0, 50)), JSON.stringify(removed.slice(0, 50))]
          );
        }
      }
    }

    if (!DRY_RUN) {
      await pool.query(
        `INSERT INTO page_watch (club_id, kind, url, lines, checked_at, changed_at, last_error)
         VALUES ($1, $2, $3, $4, now(), NULL, NULL)
         ON CONFLICT (club_id, kind) DO UPDATE SET
           url = EXCLUDED.url, lines = EXCLUDED.lines, checked_at = now(), last_error = NULL,
           changed_at = CASE WHEN page_watch.lines IS DISTINCT FROM EXCLUDED.lines AND page_watch.lines IS NOT NULL
                             THEN now() ELSE page_watch.changed_at END`,
        [p.club_id, p.kind, p.url, JSON.stringify(lines)]
      );
    }
    await sleep(DELAY_MS);
  }

  console.log(`\n${checked} page(s) checked: ${changed} changed, ${baselined} recorded for the first time. ` +
    `${skipped} skipped (JavaScript pages such as BRS listings), ${failed} failed to load.` +
    (changed && !DRY_RUN ? ' See /admin/page-changes.' : ''));
  await pool.end();
}

if (require.main === module) {
  run().catch(async err => {
    console.error('Watch failed:', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
}

module.exports = { relevantLines, unreadable };
