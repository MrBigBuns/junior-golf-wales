const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const asyncHandler = require('../lib/asyncHandler');

// Club names for the Club field's suggestions as people type
async function clubNames() {
  const { rows } = await pool.query(`SELECT name FROM clubs WHERE archived_at IS NULL ORDER BY name`);
  return rows.map(r => r.name);
}

router.get('/', asyncHandler(async (req, res) => {
  res.render('submit', { submitted: false, clubs: await clubNames(), values: {} });
}));

// Tiny in-memory limiter: 5 submissions per IP per hour (resets on restart, which is fine here)
const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 60 * 60 * 1000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < 60 * 60 * 1000)) hits.delete(k);
  return recent.length > 5;
}

router.post('/', asyncHandler(async (req, res) => {
  const { event_title, club_name, event_date, entry_fee, entry_info, contact_email, notes, website } = req.body;
  const fail = async (error) => res.render('submit', {
    submitted: false, error, clubs: await clubNames(), values: req.body
  });

  // Honeypot: hidden field real people never fill in. Pretend it worked so bots move on.
  if (website) return res.render('submit', { submitted: true });

  if (tooMany(req.ip)) return fail('Too many submissions from your connection. Please try again later.');

  const str = v => (typeof v === 'string' ? v.trim() : '');
  if (!str(event_title) || !str(club_name) || !str(event_date) || !str(contact_email)) {
    return fail('Please fill in event name, club, date and your email.');
  }
  if (str(event_title).length < 3 || str(club_name).length < 3) {
    return fail('Please enter the full event name and club name.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str(event_date)) || Number.isNaN(Date.parse(str(event_date)))) {
    return fail('Please choose a valid date.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(str(contact_email))) {
    return fail('Please enter a valid email address.');
  }

  await pool.query(
    `INSERT INTO submissions (raw_data, submitted_by_email)
     VALUES ($1, $2)`,
    [
      JSON.stringify({ event_title: str(event_title), club_name: str(club_name), event_date: str(event_date), entry_fee: str(entry_fee), entry_info: str(entry_info), notes: str(notes) }),
      str(contact_email)
    ]
  );

  res.render('submit', { submitted: true });
}));

module.exports = router;
