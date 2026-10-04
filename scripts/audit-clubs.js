// Read-only data audit for club records. Changes nothing; prints a report
// of every club with something worth checking, grouped by club.
//
// Usage (Render web shell or locally):
//   node scripts/audit-clubs.js                 all active clubs
//   node scripts/audit-clubs.js --region North
//   node scripts/audit-clubs.js --club kinsale-golf-club
//   node scripts/audit-clubs.js --gaps          also list missing fields
//   node scripts/audit-clubs.js > audit.txt     save the report
require('dotenv').config();
const pool = require('../db/pool');
const { COUNTIES } = require('../lib/site');

const argv = process.argv.slice(2);
const opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const REGION = opt('--region');
const ONE = opt('--club');
const SHOW_GAPS = argv.includes('--gaps');

const WELSH_AREAS = ['CF', 'NP', 'SA', 'LD', 'SY', 'LL', 'CH'];
// Postcode areas typical for each region (SY and LL straddle Mid/North; CH is Flintshire/Wrexham)
const REGION_AREAS = { South: ['CF', 'NP', 'SA'], Mid: ['SY', 'LD', 'LL', 'SA', 'NP'], North: ['LL', 'CH', 'SY'] };
// County sits in a different region only for Ceredigion (Dyfed) and Meirionnydd (Gwynedd) clubs listed as Mid
const ALLOWED_COUNTY_REGION = new Set(['Mid|Dyfed', 'Mid|Gwynedd']);
// Wix/Squarespace image servers host clubs' own logos, so only flag platform
// branding and Facebook image links (which expire after a few weeks)
const PLATFORM_LOGO = /s-ssl\.wordpress\.com\/i\/logo|wpcom-|gravatar\.com|fbcdn\.net|facebook\.com/i;
const ARTEFACT = /\b(it is not in|is not located in|i (could|was unable|found|cannot|can't)|unable to (find|verify)|could not (find|verify)|no (information|details) (was|were)? ?(found|available)|search results?|as an ai|the request|not (to be )?confused with)\b/i;
const CLOSED = /\b(closed|ceased|no longer (operat|open|trad)|went into administration|liquidat)/i;
// The course itself is nine holes (not 'originally nine holes' or 'plus a nine-hole academy')
const NINE = /\b(is|has) an? (\w+ )?(nine|9)[- ]hole (course|layout|parkland|heathland|links|moorland|golf course)\b/i;

function postcodeArea(address) {
  const m = (address || '').match(/\b([A-Z]{1,2})[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}\b/i);
  return m ? m[1].toUpperCase() : null;
}
const norm = s => (s || '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '');

async function run() {
  const params = [];
  const where = ['archived_at IS NULL'];
  if (REGION) { params.push(REGION); where.push(`region = $${params.length}`); }
  if (ONE) { params.push(ONE); where.push(`slug = $${params.length}`); }
  const { rows: clubs } = await pool.query(
    `SELECT id, name, slug, region, county, holes, address, lat, lng, website, contact_email,
            facebook_url, instagram_url, x_url, description, par, yardage, scorecard, logo_url,
            (logo_image IS NOT NULL) AS has_logo_image
     FROM clubs WHERE ${where.join(' AND ')} ORDER BY region, name`,
    params
  );
  // Whole-table data for duplicate checks
  const { rows: everyone } = await pool.query(
    `SELECT slug, name, website, contact_email, logo_url, lat, lng, par, yardage FROM clubs WHERE archived_at IS NULL`
  );
  const dupes = (key) => {
    const m = {};
    everyone.forEach(c => { const k = key(c); if (k) (m[k] = m[k] || []).push(c.name); });
    return m;
  };
  const byWebsite = dupes(c => c.website && norm(c.website));
  const byEmail = dupes(c => c.contact_email && c.contact_email.toLowerCase());
  const byLogo = dupes(c => c.logo_url);
  const byCoords = dupes(c => c.lat != null && `${Number(c.lat).toFixed(4)},${Number(c.lng).toFixed(4)}`);
  const byYardage = dupes(c => c.yardage);
  const others = (map, k, self) => (map[k] || []).filter(n => n !== self);

  const countyRegion = Object.fromEntries(COUNTIES.map(c => [c.name, c.region]));
  const report = [];
  const tally = {};
  const flag = (list, type, msg) => { list.push(`  [${type}] ${msg}`); tally[type] = (tally[type] || 0) + 1; };

  for (const c of clubs) {
    const issues = [];
    const card = Array.isArray(c.scorecard) && c.scorecard.length ? c.scorecard : null;

    // Location
    const area = postcodeArea(c.address);
    if (c.address) {
      if (!area) flag(issues, 'address', `no postcode: "${c.address}"`);
      else if (!WELSH_AREAS.includes(area)) flag(issues, 'address', `postcode area ${area} is outside Wales`);
      else if (c.region && !REGION_AREAS[c.region].includes(area)) flag(issues, 'address', `postcode area ${area} is unusual for ${c.region} Wales`);
      if (/\b(north|mid|south) wales\b|,\s*(uk|united kingdom|wales)\s*(,|$)/i.test(c.address)) flag(issues, 'address', `contains region/country text: "${c.address}"`);
      if (c.address.toLowerCase().startsWith(c.name.toLowerCase())) flag(issues, 'address', 'starts with the club name (shown twice in directions)');
    }
    if (c.lat != null) {
      const lat = Number(c.lat), lng = Number(c.lng);
      if (lat < 51.3 || lat > 53.5 || lng < -5.4 || lng > -2.6) flag(issues, 'location', `coordinates ${lat}, ${lng} are outside Wales`);
      const same = others(byCoords, `${lat.toFixed(4)},${lng.toFixed(4)}`, c.name);
      if (same.length) flag(issues, 'location', `same coordinates as ${same.join(', ')}`);
    }
    if (c.county && c.region && countyRegion[c.county] !== c.region && !ALLOWED_COUNTY_REGION.has(`${c.region}|${c.county}`)) {
      flag(issues, 'county', `${c.county} is a ${countyRegion[c.county]} county but club is listed as ${c.region}`);
    }

    // Description
    if (c.description) {
      if (ARTEFACT.test(c.description)) flag(issues, 'description', `research note left in: "${c.description.match(ARTEFACT)[0]}..."`);
      const mentioned = (c.description.match(/\b(North|Mid|South) Wales\b/) || [])[1];
      if (mentioned && c.region && mentioned !== c.region) flag(issues, 'description', `mentions ${mentioned} Wales but club is ${c.region}`);
      if (CLOSED.test(c.description)) flag(issues, 'description', 'mentions closure; confirm the club is open');
      if (c.description.length < 60) flag(issues, 'description', 'very short');
    }

    // Course figures
    const saysNine = c.description && NINE.test(c.description);
    if (c.holes == null && saysNine) flag(issues, 'holes', 'described as a 9-hole course but holes not set');
    if (c.holes === 18 && saysNine) flag(issues, 'holes', 'holes is 18 but the description says 9-hole');
    if (c.holes && card && card.length !== c.holes) flag(issues, 'holes', `holes is ${c.holes} but the scorecard has ${card.length}`);
    if (c.holes === 18 && c.par && c.par < 54) flag(issues, 'holes', `holes is 18 but par is only ${c.par}`);
    if (c.par && (c.par < 27 || c.par > 74)) flag(issues, 'course', `par ${c.par} is implausible`);
    if (c.yardage && (c.yardage < 1200 || c.yardage > 7800)) flag(issues, 'course', `yardage ${c.yardage} is implausible`);
    const sameYds = c.yardage ? others(byYardage, c.yardage, c.name) : [];
    if (sameYds.length) flag(issues, 'course', `yardage ${c.yardage} identical to ${sameYds.join(', ')}; possibly copied`);

    // Scorecard
    if (card) {
      if (![9, 18].includes(card.length)) flag(issues, 'scorecard', `${card.length} holes`);
      const pars = card.map(h => Number(h.par));
      if (pars.some(p => !p)) flag(issues, 'scorecard', 'some holes have no par');
      const parTotal = pars.reduce((a, b) => a + (b || 0), 0);
      if (c.par && parTotal && parTotal !== c.par && parTotal * 2 !== c.par) flag(issues, 'scorecard', `card par total ${parTotal} vs club par ${c.par}`);
      const si = card.map(h => h.strokeIndex).filter(v => v != null).map(Number);
      if (si.length === card.length) {
        const expected = card.length === 18 ? 18 : null;
        const uniq = new Set(si);
        if (uniq.size !== si.length) flag(issues, 'scorecard', 'stroke indexes repeat');
        else if (expected && [...uniq].some(v => v < 1 || v > 18)) flag(issues, 'scorecard', 'stroke index outside 1-18');
      }
      const tees = {};
      card.forEach(h => Object.entries(h.yards || {}).forEach(([t, y]) => { tees[t] = (tees[t] || 0) + (Number(y) || 0); }));
      const longest = Math.max(0, ...Object.values(tees));
      if (c.yardage && longest && Math.abs(longest - c.yardage) / c.yardage > 0.03 && Math.abs(longest * 2 - c.yardage) / c.yardage > 0.03) {
        flag(issues, 'scorecard', `longest tee totals ${longest} yds vs club yardage ${c.yardage}`);
      }
      card.forEach(h => Object.entries(h.yards || {}).forEach(([t, y]) => {
        const par = Number(h.par);
        if (/^(green|grange|orange|purple|junior|forward)/i.test(t)) return; // junior tees are short by design
        if (par && y && (y < (par === 3 ? 60 : 180) || y > (par === 3 ? 260 : par === 4 ? 520 : 680))) {
          flag(issues, 'scorecard', `hole ${h.hole} ${t} ${y} yds looks wrong for a par ${par}`);
        }
      }));
    }

    // Links and images
    if (c.logo_url && PLATFORM_LOGO.test(c.logo_url)) flag(issues, 'logo', `${/fbcdn|facebook/i.test(c.logo_url) ? 'Facebook image link (expires)' : "hosting platform's logo, not the club's"}: ${c.logo_url.slice(0, 80)}`);
    const sameLogo = c.logo_url ? others(byLogo, c.logo_url, c.name) : [];
    if (sameLogo.length) flag(issues, 'logo', `same logo as ${sameLogo.join(', ')}`);
    if (c.website) {
      if (/facebook\.com|instagram\.com|twitter\.com|x\.com/i.test(c.website)) flag(issues, 'website', 'website is a social media page');
      if (/^http:\/\//i.test(c.website)) flag(issues, 'website', 'not https');
      const sameSite = others(byWebsite, norm(c.website), c.name);
      if (sameSite.length) flag(issues, 'website', `same website as ${sameSite.join(', ')}`);
    }
    if (c.contact_email) {
      const sameMail = others(byEmail, c.contact_email.toLowerCase(), c.name);
      if (sameMail.length) flag(issues, 'email', `same email as ${sameMail.join(', ')}`);
    }

    if (SHOW_GAPS) {
      const missing = [];
      if (!c.address) missing.push('address');
      if (c.lat == null) missing.push('map location');
      if (!c.county) missing.push('county');
      if (!c.website) missing.push('website');
      if (!c.contact_email) missing.push('email');
      if (!c.description) missing.push('description');
      if (!c.holes) missing.push('holes');
      if (!c.par) missing.push('par');
      if (!c.yardage) missing.push('yardage');
      if (!card) missing.push('scorecard');
      if (!c.logo_url && !c.has_logo_image) missing.push('logo');
      if (!c.facebook_url && !c.instagram_url && !c.x_url) missing.push('social links');
      if (missing.length) flag(issues, 'gaps', missing.join(', '));
    }

    if (issues.length) report.push(`${c.name} (${c.region || 'no region'}${c.county ? ', ' + c.county : ''}) /clubs/${c.slug}\n${issues.join('\n')}`);
  }

  // Additional courses at multi-course venues
  const { rows: extra } = await pool.query(
    `SELECT cc.name, cc.slug, cc.holes, cc.par, cc.yardage, cc.scorecard, c.name AS club_name, c.slug AS club_slug
     FROM club_courses cc JOIN clubs c ON c.id = cc.club_id WHERE c.archived_at IS NULL
     ${ONE ? 'AND c.slug = $1' : ''} ORDER BY c.name, cc.sort_order`,
    ONE ? [ONE] : []
  );
  for (const cc of extra) {
    const issues = [];
    const card = Array.isArray(cc.scorecard) && cc.scorecard.length ? cc.scorecard : null;
    if (!cc.holes && !card) flag(issues, 'course', 'no holes, figures or scorecard yet');
    if (cc.holes && card && card.length !== cc.holes) flag(issues, 'holes', `holes is ${cc.holes} but the scorecard has ${card.length}`);
    if (card) {
      const parTotal = card.reduce((a, h) => a + (Number(h.par) || 0), 0);
      if (cc.par && parTotal && parTotal !== cc.par && parTotal * 2 !== cc.par) flag(issues, 'scorecard', `card par total ${parTotal} vs course par ${cc.par}`);
      const si = card.map(h => h.strokeIndex).filter(v => v != null).map(Number);
      if (si.length === card.length && new Set(si).size !== si.length) flag(issues, 'scorecard', 'stroke indexes repeat');
    }
    if (issues.length) report.push(`${cc.name} at ${cc.club_name} /clubs/${cc.club_slug}/${cc.slug}\n${issues.join('\n')}`);
  }

  console.log(`Audited ${clubs.length} active club(s); ${report.length} with something to check.\n`);
  console.log(report.join('\n\n'));
  console.log('\nSummary by type:');
  Object.entries(tally).sort((a, b) => b[1] - a[1]).forEach(([t, n]) => console.log(`  ${t.padEnd(12)} ${n}`));
  await pool.end();
}

run().catch(async err => {
  console.error('Audit failed:', err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
