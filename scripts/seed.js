require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../db/pool');

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Minimal CSV parse — good enough for our seed file, no embedded commas/quotes
function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split('\n');
  const headers = headerLine.split(',');
  return lines.map(line => {
    const values = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i]; });
    return row;
  });
}

async function upsertClub(name, region) {
  const slug = slugify(name);
  const { rows } = await pool.query(
    `INSERT INTO clubs (name, slug, region)
     VALUES ($1, $2, $3)
     ON CONFLICT (slug) DO UPDATE SET region = EXCLUDED.region
     RETURNING id`,
    [name, slug, region]
  );
  return rows[0].id;
}

async function seed() {
  const csvPath = path.join(__dirname, '..', 'data', 'events_seed.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`No seed file at ${csvPath} — copy events_seed.csv into /data first.`);
    process.exit(1);
  }

  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  let count = 0;

  for (const row of rows) {
    const clubId = await upsertClub(row.club, row.region);
    const eventSlug = slugify(`${row.title}-${row.club}-${row.date}`);
    const fee = row.entry_fee === 'TBC' ? null : parseFloat(row.entry_fee);

    await pool.query(
      `INSERT INTO events (title, slug, club_id, date_start, format, entry_fee, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'tentative')
       ON CONFLICT (slug) DO NOTHING`,
      [row.title, eventSlug, clubId, row.date, row.format, fee]
    );
    count++;
  }

  console.log(`Seeded ${count} events.`);
  await pool.end();
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
