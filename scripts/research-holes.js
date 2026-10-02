// Finds how many holes each club's main course has, and for nine-hole
// courses the par and yardage for one nine-hole round. Clubs with a 9- or
// 18-hole scorecard are filled automatically on deploy; this covers the rest.
// Results are queued at /admin/club-suggestions for review.
//
//   node scripts/research-holes.js --dry-run --limit 3    try it
//   node scripts/research-holes.js --limit 50             queue results
//   node scripts/research-holes.js --club brecon-golf-club
//
// Uses Claude with a short web search (roughly 2-4p per club).
require('dotenv').config();
const pool = require('../db/pool');

const API_BASE = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const argv = process.argv.slice(2);
const opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const LIMIT = Number(opt('--limit')) || 20;
const ONE = opt('--club');
const DRY_RUN = argv.includes('--dry-run');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ask(club) {
  const where = club.region ? `${club.region} Wales` : 'Wales';
  const res = await fetch(`${API_BASE}/v1/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 800,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: [{
        role: 'user',
        content: `How many holes does the main golf course at "${club.name}" in ${where}, UK have? Prefer the club's own website.

Reply with ONLY a JSON object, no other text:
{"holes": 18, "nine_hole_par": null, "nine_hole_yardage": null, "source": "url"}

Rules:
- "holes" is the number of holes on the club's main course as built: 9, 18, 27 or 36. Many nine-hole courses are played twice for an 18-hole round; that is still 9.
- If and only if it is a nine-hole course, give the par and yardage (longest standard tee) for ONE nine-hole round, as integers, if you can find them; otherwise null.
- Use null for anything you cannot verify. Never guess.`
      }]
    })
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('No JSON in response');
  return JSON.parse(text.slice(a, b + 1));
}

async function run() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set.');
  const params = [];
  let where = `archived_at IS NULL AND holes IS NULL
    AND NOT EXISTS (SELECT 1 FROM club_suggestions s WHERE s.club_id = clubs.id AND s.status = 'pending' AND s.data ? 'holes')`;
  if (ONE) { params.push(ONE); where = `slug = $1`; }
  params.push(LIMIT);
  const { rows } = await pool.query(
    `SELECT id, name, region, par, yardage FROM clubs WHERE ${where} ORDER BY name LIMIT $${params.length}`, params
  );
  console.log(`${DRY_RUN ? 'Dry run' : 'Queueing'}: ${rows.length} club(s)\n`);

  let queued = 0, failed = 0;
  for (const c of rows) {
    try {
      const r = await ask(c);
      const holes = [9, 18, 27, 36].includes(r.holes) ? r.holes : null;
      if (!holes) { console.log(`${c.name}: not found`); continue; }
      const data = { holes };
      const sources = { holes: typeof r.source === 'string' ? r.source : null };
      const warnings = [];
      if (holes === 9) {
        const p = Number.isInteger(r.nine_hole_par) && r.nine_hole_par >= 27 && r.nine_hole_par <= 38 ? r.nine_hole_par : null;
        const y = Number.isInteger(r.nine_hole_yardage) && r.nine_hole_yardage >= 1000 && r.nine_hole_yardage <= 3900 ? r.nine_hole_yardage : null;
        if (p) { data.par = p; sources.par = sources.holes; }
        if (y) { data.yardage = y; sources.yardage = sources.holes; }
        warnings.push('Nine-hole course. Ticking holes alone fixes the page; also tick par and yardage to store the 9-hole figures instead of the 18-hole ones.');
      }
      console.log(`${c.name}: ${holes} holes${data.par ? `, 9-hole par ${data.par}` : ''}${data.yardage ? `, ${data.yardage} yds` : ''}`);
      if (!DRY_RUN) {
        await pool.query(
          `INSERT INTO club_suggestions (club_id, data, sources, warnings) VALUES ($1, $2, $3, $4)`,
          [c.id, JSON.stringify(data), JSON.stringify(sources), JSON.stringify(warnings)]
        );
        queued++;
      }
    } catch (err) {
      failed++;
      console.log(`${c.name}: FAILED - ${err.message}`);
    }
    await sleep(1500);
  }
  console.log(`\n${queued} queued, ${failed} failed.${queued ? ' Review at /admin/club-suggestions.' : ''}`);
  await pool.end();
}

run().catch(async err => {
  console.error('Failed:', err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
