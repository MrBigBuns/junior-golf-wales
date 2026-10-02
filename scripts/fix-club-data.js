// Safe, mechanical clean-ups for club records. Dry run by default: prints
// every change it would make. Add --apply to write them.
//
//   node scripts/fix-club-data.js            preview
//   node scripts/fix-club-data.js --apply    write the changes
//
// Fixes:
//  - addresses that start with the club name (shown twice in directions)
//  - region/country text in addresses ("North Wales", "Wales", "UK", ...)
//  - stray page-title text in addresses ("Wayfind | ...")
//  - logos that won't work: hosting-platform branding (WordPress.com) and
//    Facebook image links, which carry an expiry code and break after a few weeks
require('dotenv').config();
const pool = require('../db/pool');

const APPLY = process.argv.includes('--apply');
const BAD_LOGO = /s-ssl\.wordpress\.com\/i\/logo|wpcom-|fbcdn\.net|scontent[-.].*\.fbcdn/i;

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function cleanAddress(address, name) {
  let a = address.trim();
  a = a.replace(/^[^|,]{0,40}\|\s*/, '');                                  // "Wayfind | ..."
  const lead = new RegExp('^' + escapeRe(name) + '\\s*,\\s*', 'i');
  a = a.replace(lead, '');                                                  // "Tenby Golf Club, ..."
  a = a.replace(/,?\s*\b(North|Mid|South) Wales\b/gi, '');                  // "..., North Wales"
  a = a.replace(/,\s*Wales\b(?=\s*,|\s+[A-Z]{1,2}\d|\s*$)/g, '');           // "..., Wales, SA70 7NP"
  a = a.replace(/,\s*(UK|United Kingdom|GB|Great Britain)\s*$/i, '');       // "..., UK"
  a = a.replace(/\s*,\s*,+/g, ',').replace(/\s{2,}/g, ' ').replace(/^[,\s]+|[,\s]+$/g, '');
  // Keep a comma before a trailing postcode: "Holywell CH8 9DX" -> "Holywell, CH8 9DX"
  a = a.replace(/([a-z])\s+([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})$/, '$1, $2');
  return a;
}

async function run() {
  const { rows } = await pool.query(`SELECT id, name, address, logo_url FROM clubs WHERE archived_at IS NULL ORDER BY name`);
  let changes = 0;
  for (const c of rows) {
    const sets = {};
    if (c.address) {
      const cleaned = cleanAddress(c.address, c.name);
      if (cleaned && cleaned !== c.address) sets.address = cleaned;
    }
    if (c.logo_url && BAD_LOGO.test(c.logo_url)) sets.logo_url = null;
    if (!Object.keys(sets).length) continue;

    changes++;
    console.log(c.name);
    if ('address' in sets) console.log(`  address: "${c.address}"\n       ->  "${sets.address}"`);
    if ('logo_url' in sets) console.log(`  logo:    removed (${c.logo_url.slice(0, 70)}...)`);
    if (APPLY) {
      const cols = Object.keys(sets);
      await pool.query(
        `UPDATE clubs SET ${cols.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${cols.length + 1}`,
        [...cols.map(k => sets[k]), c.id]
      );
    }
  }
  console.log(`\n${changes} club(s) ${APPLY ? 'updated' : 'would change'}.${APPLY ? '' : ' Run with --apply to write these changes.'}`);
  await pool.end();
}

run().catch(async err => {
  console.error('Failed:', err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
