// Standard event titles: "Club Junior Open (tag)" for club events and
// "Series: Event" for series events (club added when a series event runs at
// several clubs). No year in the title. Web addresses (slugs) are NOT changed.
// Idempotent: matches on id AND the old title, so re-running does nothing.
// Run via the Render web shell: node scripts/rename-events-to-standard-format.js
require('dotenv').config();
const pool = require('../db/pool');

const RENAMES = [
  [12, 'Junior Open', 'Ashburnham Junior Open'],
  [14, "Junior Open - 'Ben Williams Trophy'", 'Whitchurch Junior Open (Ben Williams Trophy)'],
  [15, 'Junior Open (Open Week)', 'Abergele Junior Open (Open Week)'],
  [16, 'Junior Open (Daily Telegraph qualifier)', 'Conwy Junior Open (Daily Telegraph qualifier)'],
  [25, 'Wales Mini Masters Final', 'Wales Mini Masters: Final'],
  [26, 'PING Welsh Junior Tour Event 2', 'PING Welsh Junior Tour: Event 2'],
  [27, 'PING Welsh Junior Tour Event 3', 'PING Welsh Junior Tour: Event 3'],
  [28, 'PING Welsh Junior Tour Event 4', 'PING Welsh Junior Tour: Event 4'],
  [29, 'PING Welsh Junior Tour Event 6', 'PING Welsh Junior Tour: Event 6'],
  [30, 'PING Welsh Junior Tour Final', 'PING Welsh Junior Tour: Final'],
  [39, 'Raglan Juniors Open', 'Raglan Junior Open'],
  [41, 'Junior Open (Daily Telegraph qualifier)', 'Aberdovey Junior Open (Daily Telegraph qualifier)'],
  [50, 'Junior Open', 'Vale of Llangollen Junior Open'],
  [51, 'British Kids Championship 2026', 'U.S. Kids Golf: British Kids Championship'],
  [52, '2027 Faldo Futures Qualifying Event', 'Faldo Futures Qualifier: Langland Bay'],
  [53, '2027 Faldo Futures Qualifying Event', 'Faldo Futures Qualifier: Trefloyne']
];

async function run() {
  let changed = 0;
  for (const [id, oldTitle, newTitle] of RENAMES) {
    const { rows } = await pool.query(
      `UPDATE events SET title = $1, updated_at = now() WHERE id = $2 AND title = $3 RETURNING id`,
      [newTitle, id, oldTitle]
    );
    if (rows.length) { changed++; console.log(`#${id}: "${oldTitle}" -> "${newTitle}"`); }
  }
  console.log(`${changed} of ${RENAMES.length} renamed (others already done or edited by hand).`);
  await pool.end();
}

run().catch(err => {
  console.error('Rename failed:', err.message);
  process.exit(1);
});
