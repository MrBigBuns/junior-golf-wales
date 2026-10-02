// Researches clubs with missing details and queues proposed values for review
// at /admin/club-suggestions. Nothing is written to the clubs table here.
//
// For each club it:
//   1. asks Claude (with web search) for address, website, contacts, par,
//      yardage, a short description and, if published, a hole-by-hole
//      scorecard, with a source URL for each value;
//   2. fetches the club's own homepage for social links and a logo;
//   3. geocodes the postcode and sanity-checks everything.
//
// Usage (locally with a .env, or the Render web shell):
//   node scripts/enrich-clubs.js                    next 10 clubs with gaps (South)
//   node scripts/enrich-clubs.js --limit 25
//   node scripts/enrich-clubs.js --club radyr-golf-club
//   node scripts/enrich-clubs.js --region North
//   node scripts/enrich-clubs.js --dry-run          print results, queue nothing
//   node scripts/enrich-clubs.js --redo             include clubs already researched
//
// Needs ANTHROPIC_API_KEY. Web search must be enabled for your organisation
// in the Anthropic Console (Settings > Privacy / features).
require('dotenv').config();
const pool = require('../db/pool');
const { geocodeAddress } = require('../lib/geocode');
const { deriveTotals, isScorecard } = require('../lib/scorecard');
const { COUNTY_NAMES } = require('../lib/site');

const API_BASE = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const DELAY_MS = 2000;
const WELSH_POSTCODE_AREAS = ['CF', 'NP', 'SA', 'LD', 'SY', 'LL', 'CH'];

const argv = process.argv.slice(2);
const opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const LIMIT = Number(opt('--limit')) || 10;
const ONE_CLUB = opt('--club');
const REGION = opt('--region') || 'South';
const DRY_RUN = argv.includes('--dry-run');
const REDO = argv.includes('--redo');

const sleep = ms => new Promise(r => setTimeout(r, ms));

const FIELDS = ['county', 'address', 'website', 'contact_email', 'facebook_url', 'instagram_url', 'x_url',
  'description', 'par', 'yardage', 'scorecard', 'logo_url'];

function prompt(clubName, region) {
  const where = region ? `${region} Wales` : 'Wales';
  return `Research the golf club "${clubName}" in ${where}, UK, using web search. Prefer the club's own official website; Visit Wales, Companies House and Wales Golf are good secondary sources.

Return ONLY a JSON object (no markdown, no commentary) in exactly this shape:
{
  "county": "one of Glamorgan, Gwent, Dyfed, Powys, Gwynedd, Clwyd (the golf county the club is in), or null",
  "address": "full postal address including postcode, or null",
  "website": "official club website homepage URL, or null",
  "contact_email": "general club/office email, or null",
  "facebook_url": null, "instagram_url": null, "x_url": null,
  "par": 72, "yardage": 6500,
  "yardage_tee": "tee colour the yardage refers to, or null",
  "description": "2-3 factual sentences in your own words: course type (links/parkland/heathland), year founded, designer, notable features or championships. null if you cannot verify.",
  "scorecard": null,
  "sources": { "address": "url", "website": "url", "contact_email": "url", "par": "url", "yardage": "url", "description": "url", "scorecard": "url" }
}

Rules:
- Only include values you actually found on a web page. Use null for anything you could not find. Never guess or estimate.
- par and yardage are for ONE round of the main course as built, from the longest standard tee (usually white), as integers. For a nine-hole course give the nine-hole par and yardage, not the figures for going round twice.
- The description must only describe the club. Never comment on your research, the request, or corrections (e.g. do not write "it is not in South Wales").
- "scorecard" must be null unless you found hole-by-hole data. If found, it is an array like
  [{"hole":1,"par":4,"strokeIndex":13,"yards":{"white":319,"yellow":296,"red":254}}, ...]
  with lowercase tee colours, only tees actually listed.
- If the club appears to have closed or merged, set "description" to a note saying so and cite the source.
- "sources" gives the page URL each value came from.`;
}

async function askClaude(clubName, region) {
  const res = await fetch(`${API_BASE}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }],
      messages: [{ role: 'user', content: prompt(clubName, region) }]
    })
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object in response');
  return JSON.parse(text.slice(start, end + 1));
}

const BROWSER_HEADERS = {
  // Some club sites reject non-browser user agents, so present as a normal browser
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9'
};

async function fetchOnce(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: BROWSER_HEADERS });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return { html: await res.text(), finalUrl: res.url || url };
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'timed out' : e.message };
  } finally {
    clearTimeout(t);
  }
}

// Tries the URL as given, then the www / non-www and https variants.
async function fetchPage(url) {
  const tried = new Set();
  const variants = [url];
  try {
    const u = new URL(url);
    const alt = new URL(url);
    alt.hostname = u.hostname.startsWith('www.') ? u.hostname.slice(4) : 'www.' + u.hostname;
    variants.push(alt.href);
    if (u.protocol === 'http:') { const s = new URL(url); s.protocol = 'https:'; variants.push(s.href); }
  } catch (e) { /* malformed URL: just try as given */ }

  let lastError = 'no response';
  for (const v of variants) {
    if (tried.has(v)) continue;
    tried.add(v);
    const r = await fetchOnce(v);
    if (r.html) return r;
    lastError = r.error;
  }
  return { error: lastError };
}

function absolute(href, base) {
  try { return new URL(href, base).href; } catch (e) { return null; }
}

// Social links and a logo candidate from the club's own homepage.
function scrapeHomepage(html, baseUrl) {
  const out = {};
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map(m => m[1]);
  const pick = re => hrefs.find(h => re.test(h) && !/sharer|share\?|intent\/tweet|\/plugins\//i.test(h));
  out.facebook_url = pick(/^https?:\/\/(www\.|m\.)?facebook\.com\/[^\/?#]+/i) || null;
  out.instagram_url = pick(/^https?:\/\/(www\.)?instagram\.com\/[^\/?#]+/i) || null;
  out.x_url = pick(/^https?:\/\/(www\.)?(x|twitter)\.com\/[^\/?#]+/i) || null;

  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => m[0]);
  const logoImg = imgs.find(tag => /logo/i.test(tag) && /src=["'][^"']+["']/i.test(tag));
  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  const touchIcon = html.match(/<link[^>]+rel=["']apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i);

  let logo = null;
  if (logoImg) logo = logoImg.match(/src=["']([^"']+)["']/i)[1];
  else if (touchIcon) logo = touchIcon[1];
  else if (ogImage) logo = ogImage[1];
  // Ignore the hosting platform's own branding (WordPress.com, Wix, Squarespace, etc.)
  // (Wix and Squarespace image servers host clubs' own logos, so those are fine.)
  const PLATFORM_LOGO = /s-ssl\.wordpress\.com\/i\/logo|wpcom-|gravatar\.com|fbcdn\.net|facebook\.com/i;
  const resolved = logo && !logo.startsWith('data:') ? absolute(logo, baseUrl) : null;
  out.logo_url = resolved && !PLATFORM_LOGO.test(resolved) ? resolved : null;
  return out;
}

function postcodeArea(address) {
  const m = (address || '').match(/\b([A-Z]{1,2})[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}\b/i);
  return m ? m[1].toUpperCase() : null;
}

function cleanUrl(u) {
  return typeof u === 'string' && /^https?:\/\//i.test(u) ? u.trim() : null;
}

async function research(club) {
  const warnings = [];
  const found = await askClaude(club.name, club.region);
  const sources = found.sources || {};

  const county = typeof found.county === 'string'
    ? COUNTY_NAMES.find(n => n.toLowerCase() === found.county.trim().toLowerCase()) || null
    : null;
  const data = {
    county,
    address: typeof found.address === 'string' ? found.address.trim() : null,
    website: cleanUrl(found.website),
    contact_email: typeof found.contact_email === 'string' && found.contact_email.includes('@') ? found.contact_email.trim() : null,
    facebook_url: cleanUrl(found.facebook_url),
    instagram_url: cleanUrl(found.instagram_url),
    x_url: cleanUrl(found.x_url),
    description: typeof found.description === 'string' ? found.description.trim() : null,
    par: Number.isInteger(found.par) ? found.par : null,
    yardage: Number.isInteger(found.yardage) ? found.yardage : null,
    scorecard: isScorecard(found.scorecard) ? found.scorecard : null,
    logo_url: null
  };
  if (found.yardage_tee && data.yardage) sources.yardage_tee = found.yardage_tee;

  // Postcode must be Welsh, and must geocode
  if (data.address) {
    const area = postcodeArea(data.address);
    if (!area) warnings.push('Address has no recognisable postcode.');
    else if (!WELSH_POSTCODE_AREAS.includes(area)) {
      warnings.push(`Postcode area ${area} is outside Wales; address dropped.`);
      data.address = null;
    }
  }
  if (data.address) {
    const geo = await geocodeAddress(data.address);
    if (geo) { data.lat = geo.lat; data.lng = geo.lng; } else warnings.push('Postcode did not geocode; check the address.');
  }

  // Plausibility checks
  if (data.par && (data.par < 27 || data.par > 75)) { warnings.push(`Par ${data.par} looks wrong; dropped.`); data.par = null; }
  if (data.yardage && (data.yardage < 1000 || data.yardage > 7800)) { warnings.push(`Yardage ${data.yardage} looks wrong; dropped.`); data.yardage = null; }
  if (data.scorecard) {
    const holes = data.scorecard.length;
    const { par } = deriveTotals(data.scorecard);
    if (![9, 18].includes(holes)) warnings.push(`Scorecard has ${holes} holes; check it.`);
    if (data.par && par && holes === 18 && par !== data.par) warnings.push(`Scorecard par total ${par} differs from stated par ${data.par}.`);
    if (!sources.scorecard) warnings.push('Scorecard has no source URL; verify before accepting.');
  }

  // Homepage scrape: social links and logo, from the club's own site
  if (data.website) {
    const page = await fetchPage(data.website);
    if (!page.html) {
      warnings.push(`Website did not load for the script (${page.error}); social links and logo need filling manually.`);
    } else {
      const scraped = scrapeHomepage(page.html, page.finalUrl);
      for (const k of ['facebook_url', 'instagram_url', 'x_url']) {
        if (scraped[k]) { data[k] = scraped[k]; sources[k] = page.finalUrl; }
      }
      if (scraped.logo_url) { data.logo_url = scraped.logo_url; sources.logo_url = page.finalUrl; }
    }
  }

  return { data, sources, warnings };
}

async function pickClubs() {
  if (ONE_CLUB) {
    const { rows } = await pool.query(`SELECT id, name, slug, region FROM clubs WHERE slug = $1`, [ONE_CLUB]);
    return rows;
  }
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.slug, c.region FROM clubs c
     WHERE c.region = $1
       AND c.archived_at IS NULL
       AND (c.county IS NULL OR c.address IS NULL OR c.website IS NULL OR c.lat IS NULL OR c.par IS NULL
            OR c.description IS NULL OR c.scorecard IS NULL OR c.logo_url IS NULL)
       AND ($2 OR NOT EXISTS (SELECT 1 FROM club_suggestions s WHERE s.club_id = c.id))
     ORDER BY c.name
     LIMIT $3`,
    [REGION, REDO, LIMIT]
  );
  return rows;
}

async function run() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set.');
  const clubs = await pickClubs();
  console.log(`${DRY_RUN ? 'Dry run' : 'Queueing'}: ${clubs.length} club(s)\n`);

  let queued = 0, failed = 0;
  for (const club of clubs) {
    try {
      const { data, sources, warnings } = await research(club);
      const filled = FIELDS.filter(f => data[f] != null).length;
      console.log(`${club.name}: ${filled}/${FIELDS.length} fields${data.scorecard ? `, scorecard ${data.scorecard.length} holes` : ''}`);
      warnings.forEach(w => console.log(`   ! ${w}`));
      if (DRY_RUN) console.log(JSON.stringify({ data, sources }, null, 2));
      else {
        await pool.query(
          `INSERT INTO club_suggestions (club_id, data, sources, warnings) VALUES ($1, $2, $3, $4)`,
          [club.id, JSON.stringify(data), JSON.stringify(sources), JSON.stringify(warnings)]
        );
        queued++;
      }
    } catch (err) {
      failed++;
      console.log(`${club.name}: FAILED - ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\n${queued} queued, ${failed} failed.${queued ? ' Review at /admin/club-suggestions.' : ''}`);
  await pool.end();
}

run().catch(async err => {
  console.error('Enrichment failed:', err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
