// Rewrites club descriptions that contain leftover research notes ("I could
// not find...", "It is not in South Wales") so they read as plain club
// descriptions. Uses Claude without web search: it may only remove or
// rephrase what is already there, never add facts. Each rewrite is queued at
// /admin/club-suggestions for review; nothing changes on the site until you
// accept it.
//
//   node scripts/clean-descriptions.js --dry-run   show rewrites only
//   node scripts/clean-descriptions.js             queue rewrites for review
require('dotenv').config();
const pool = require('../db/pool');

const API_BASE = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const DRY_RUN = process.argv.includes('--dry-run');
const ARTEFACT = /\b(it is not in|is not located in|i (could|was unable|found|cannot|can't)|unable to (find|verify)|could not (find|verify)|no (information|details) (was|were)? ?(found|available)|search results?|as an ai|the request|not (to be )?confused with)\b/i;

async function rewrite(name, region, text) {
  const res = await fetch(`${API_BASE}/v1/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Below is a description of ${name}, a golf club in ${region} Wales, for a public club directory. It contains notes about the research process (for example "I could not find...", "I found...", "It is not in South Wales"). Rewrite it as a clean 2-3 sentence description of the club.

Rules:
- Use only facts already stated in the text. Do not add, infer or embellish anything.
- Remove every sentence about searching, sources not found, uncertainty, or corrections to the request.
- Keep plain British English and a neutral tone.
- If nothing factual about the club remains, reply with exactly: NONE
- Reply with the description only, no preamble.

Text:
${text}`
      }]
    })
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
}

async function run() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set.');
  const { rows } = await pool.query(
    `SELECT id, name, region, description FROM clubs WHERE archived_at IS NULL AND description IS NOT NULL ORDER BY name`
  );
  const targets = rows.filter(c => ARTEFACT.test(c.description));
  console.log(`${targets.length} description(s) with research notes.\n`);

  let queued = 0;
  for (const c of targets) {
    try {
      const out = await rewrite(c.name, c.region || '', c.description);
      const empty = out === 'NONE' || out.length < 30;
      console.log(`${c.name}\n  before: ${c.description}\n  after:  ${empty ? '(nothing factual left; clear it or write one)' : out}\n`);
      if (DRY_RUN || empty || ARTEFACT.test(out)) continue;
      await pool.query(
        `INSERT INTO club_suggestions (club_id, data, sources, warnings) VALUES ($1, $2, $3, $4)`,
        [c.id, JSON.stringify({ description: out }), JSON.stringify({}),
         JSON.stringify(['Description rewritten to remove research notes. Tick it to accept; check no facts were lost.'])]
      );
      queued++;
    } catch (err) {
      console.log(`${c.name}: FAILED - ${err.message}\n`);
    }
  }
  console.log(DRY_RUN ? 'Dry run: nothing queued.' : `${queued} rewrite(s) queued at /admin/club-suggestions.`);
  await pool.end();
}

run().catch(async err => {
  console.error('Failed:', err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
