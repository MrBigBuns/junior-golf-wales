// Crawls each club's website for its open competitions page and its junior
// golf page, and queues what it finds at /admin/club-suggestions.
//
// It reads the homepage menus and links; if no opens link is there it also
// checks one "Visitors"/"Golf" page. Links to booking systems are recognised:
// a BRS link anywhere on the site gives the club's BRS open competitions
// listing (https://visitors.brsgolf.com/<club>#/open-competitions).
//
//   node scripts/find-club-links.js --dry-run --limit 5
//   node scripts/find-club-links.js                     all clubs not yet done
//   node scripts/find-club-links.js --club aberdovey-golf-club
//   node scripts/find-club-links.js --redo              include clubs already done
//
// No AI involved: plain page fetches, about 2-3 seconds per club.
require('dotenv').config();
const pool = require('../db/pool');

const argv = process.argv.slice(2);
const opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const LIMIT = Number(opt('--limit')) || 500;
const ONE = opt('--club');
const DRY_RUN = argv.includes('--dry-run');
const REDO = argv.includes('--redo');
const DELAY_MS = 1500;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9'
};

async function fetchOnce(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: HEADERS });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const type = res.headers.get('content-type') || '';
    if (!/html/i.test(type)) return { error: `not a web page (${type.split(';')[0]})` };
    return { html: await res.text(), finalUrl: res.url || url };
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'timed out' : e.message };
  } finally {
    clearTimeout(t);
  }
}

// Tries the URL, then the www / non-www and https variants
async function fetchPage(url) {
  const variants = [url];
  try {
    const u = new URL(url);
    const alt = new URL(url);
    alt.hostname = u.hostname.startsWith('www.') ? u.hostname.slice(4) : 'www.' + u.hostname;
    variants.push(alt.href);
    if (u.protocol === 'http:') { const h = new URL(url); h.protocol = 'https:'; variants.push(h.href); }
  } catch (e) { /* malformed: try as given */ }
  let firstError = null;
  for (const v of [...new Set(variants)]) {
    const r = await fetchOnce(v);
    if (r.html) return r;
    firstError = firstError || r.error;   // the address as given is the most telling failure
  }
  return { error: firstError || 'no response' };
}

const decode = s => s.replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&#8217;/g, "'");

function extractLinks(html, baseUrl) {
  const links = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const hrefM = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!hrefM) continue;
    const raw = decode(hrefM[1].trim());
    if (/^(mailto:|tel:|javascript:|#$)/i.test(raw)) continue;
    let url;
    try { url = new URL(raw, baseUrl).href; } catch (e) { continue; }
    const label = (attrs.match(/(?:aria-label|title)\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    const text = decode((m[2].replace(/<[^>]+>/g, ' ') + ' ' + label).replace(/\s+/g, ' ').trim());
    links.push({ url, text });
  }
  return links;
}

const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
const SOCIAL = /facebook\.com|instagram\.com|twitter\.com|x\.com|youtube\.com|tiktok\.com|linkedin\.com|google\.[a-z.]+\/maps|wa\.me/i;
const NOT_OPENS = /\b(results?|members?['’]? (area|login)|log ?in|sign ?in|news|vacanc|job|privacy|cookie|terms|wedding|function|hotel|spa|restaurant|menu)\b/i;
const BOOKING_HOSTS = /brsgolf\.com|howdidido\.com|intelligentgolf\.co\.uk|clubv1\.com|golfgenius\.com|masterscoreboard\.co\.uk|golf-?empire|teeitup|chronogolf/i;

function scoreOpens(l) {
  const hay = `${l.text} ${l.url}`;
  let s = 0;
  if (/open[\s_-]*comp|\bopens\b|open[\s_-]*(events?|days?|fixtures)|visitor(s|['’]s)?[\s_-]*comp|open[\s_-]*competitions?/i.test(hay)) s += 10;
  else if (/competitions?/i.test(hay)) s += 8;   // often lists opens too; flagged for checking
  else if (/fixtures?/i.test(hay)) s += 6;
  if (/brsgolf\.com\/.*open|open-competitions|opens_home|opens_day/i.test(l.url)) s += 12;
  else if (BOOKING_HOSTS.test(l.url) && /open|comp/i.test(hay)) s += 6;
  if (/junior/i.test(hay)) s -= 2;            // "junior open" pages still count, but prefer the full list
  if (NOT_OPENS.test(l.text)) s -= 8;
  if (/\.pdf($|\?)/i.test(l.url)) s -= 2;
  return s;
}

function scoreJuniors(l, siteHost) {
  const hay = `${l.text} ${l.url}`;
  let s = 0;
  if (/\bjuniors?\b|junior[\s_-]*(section|golf|membership|academy|coaching)|\byouth\b/i.test(hay)) s += 10;
  else if (/\bacademy\b|\bkids\b|children|new to golf|beginners|golf school|tri[\s-]?golf/i.test(hay)) s += 5;
  if (/junior[\s_-]*open/i.test(hay)) s -= 4;  // a junior open is an event, not the junior section
  if (NOT_OPENS.test(l.text) || /\bresults?\b/i.test(l.text)) s -= 6;
  if (host(l.url) !== siteHost) s -= 4;         // prefer the club's own pages
  return s;
}

function brsListing(links) {
  for (const l of links) {
    const m = l.url.match(/(?:visitors\.|members\.)?brsgolf\.com\/([a-z0-9_-]+)/i);
    if (m && !/^(opencomps|images|static|api|www|help|support)$/i.test(m[1])) {
      return { url: `https://visitors.brsgolf.com/${m[1].toLowerCase()}#/open-competitions`, from: l.url };
    }
  }
  return null;
}

function best(links, scorer, min) {
  let top = null;
  for (const l of links) {
    if (SOCIAL.test(l.url)) continue;
    const s = scorer(l);
    if (s >= min && (!top || s > top.score)) top = { ...l, score: s };
  }
  return top;
}

async function research(club) {
  const page = await fetchPage(club.website);
  if (!page.html) return { error: `website did not load (${page.error})` };
  const siteHost = host(page.finalUrl);
  let links = extractLinks(page.html, page.finalUrl);
  const pagesRead = [page.finalUrl];

  let opens = best(links, scoreOpens, 8);
  let juniors = best(links, l => scoreJuniors(l, siteHost), 10);

  // One level down: opens are often on the Visitors / Golf page
  if (!opens || !juniors) {
    const hub = links.find(l => host(l.url) === siteHost && l.url !== page.finalUrl &&
      /^(visitors?|visiting|golf|the course|green ?fees?|competitions|play|juniors?|membership)$/i.test(l.text.trim()));
    if (hub) {
      await sleep(800);
      const sub = await fetchPage(hub.url);
      if (sub.html) {
        const more = extractLinks(sub.html, sub.finalUrl);
        links = links.concat(more);
        pagesRead.push(sub.finalUrl);
        if (!opens) opens = best(more, scoreOpens, 8);
        if (!juniors) juniors = best(more, l => scoreJuniors(l, siteHost), 10);
      }
    }
  }

  const result = { pagesRead, data: {}, sources: {}, warnings: [] };
  // A BRS link anywhere gives the club's BRS opens listing; prefer it over a vague "competitions" page
  const brs = brsListing(links);
  if (brs && (!opens || opens.score < 12)) {
    result.data.opens_url = brs.url;
    result.sources.opens_url = page.finalUrl;
    result.warnings.push(`Opens link built from the club's BRS booking link (${brs.from.slice(0, 80)}); check it lists their open competitions.`);
  } else if (opens) {
    result.data.opens_url = opens.url;
    result.sources.opens_url = pagesRead[pagesRead.length - 1];
    if (opens.score < 10) result.warnings.push(`Opens link is a general "${opens.text.slice(0, 40)}" page; check it covers open competitions.`);
  }
  if (juniors) {
    result.data.juniors_url = juniors.url;
    result.sources.juniors_url = page.finalUrl;
  }
  return result;
}

async function run() {
  const params = [];
  let where = `archived_at IS NULL AND website IS NOT NULL`;
  if (ONE) { params.push(ONE); where = `slug = $1`; }
  else if (!REDO) {
    where += ` AND (opens_url IS NULL OR juniors_url IS NULL)
      AND NOT EXISTS (SELECT 1 FROM club_suggestions s WHERE s.club_id = clubs.id AND s.status = 'pending'
                      AND (s.data ? 'opens_url' OR s.data ? 'juniors_url'))`;
  }
  params.push(LIMIT);
  const { rows } = await pool.query(
    `SELECT id, name, website, opens_url, juniors_url FROM clubs WHERE ${where} ORDER BY name LIMIT $${params.length}`, params
  );
  console.log(`${DRY_RUN ? 'Dry run' : 'Queueing'}: ${rows.length} club website(s)\n`);

  let queued = 0, none = 0, failed = 0;
  for (const c of rows) {
    const r = await research(c);
    if (r.error) { failed++; console.log(`${c.name}: ${r.error}`); await sleep(DELAY_MS); continue; }
    // Never propose what the club already has
    if (c.opens_url && r.data.opens_url === c.opens_url) delete r.data.opens_url;
    if (c.juniors_url && r.data.juniors_url === c.juniors_url) delete r.data.juniors_url;
    const found = Object.keys(r.data);
    if (!found.length) { none++; console.log(`${c.name}: nothing found`); await sleep(DELAY_MS); continue; }
    console.log(`${c.name}`);
    if (r.data.opens_url) console.log(`   opens:   ${r.data.opens_url}`);
    if (r.data.juniors_url) console.log(`   juniors: ${r.data.juniors_url}`);
    r.warnings.forEach(w => console.log(`   ! ${w}`));
    if (!DRY_RUN) {
      await pool.query(
        `INSERT INTO club_suggestions (club_id, data, sources, warnings) VALUES ($1, $2, $3, $4)`,
        [c.id, JSON.stringify(r.data), JSON.stringify(r.sources), JSON.stringify(r.warnings)]
      );
      queued++;
    }
    await sleep(DELAY_MS);
  }
  console.log(`\n${queued} queued, ${none} with nothing found, ${failed} website(s) failed to load.${queued ? ' Review at /admin/club-suggestions.' : ''}`);
  await pool.end();
}

if (require.main === module) {
  run().catch(async err => {
    console.error('Failed:', err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
}

module.exports = { extractLinks, scoreOpens, scoreJuniors, brsListing, best };
