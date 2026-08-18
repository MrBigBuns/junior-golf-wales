const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const asyncHandler = require('../lib/asyncHandler');
const { requireClubLogin, requireApprovedClub } = require('../lib/clubAuth');

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ---------- Signup ----------
router.get('/signup', asyncHandler(async (req, res) => {
  const { rows: clubs } = await pool.query(`SELECT id, name FROM clubs ORDER BY name`);
  res.render('portal/signup', { clubs, error: null });
}));

router.post('/signup', asyncHandler(async (req, res) => {
  const { name, email, password, club_id } = req.body;
  const { rows: clubs } = await pool.query(`SELECT id, name FROM clubs ORDER BY name`);

  if (!name || !email || !password || !club_id) {
    return res.render('portal/signup', { clubs, error: 'Please fill in every field.' });
  }
  if (password.length < 8) {
    return res.render('portal/signup', { clubs, error: 'Password must be at least 8 characters.' });
  }

  const { rows: existing } = await pool.query(`SELECT id FROM club_users WHERE email = $1`, [email]);
  if (existing.length) {
    return res.render('portal/signup', { clubs, error: 'An account with that email already exists.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO club_users (club_id, name, email, password_hash) VALUES ($1, $2, $3, $4)`,
    [club_id, name, email, passwordHash]
  );

  res.render('portal/signup-success');
}));

// ---------- Login / logout ----------
router.get('/login', (req, res) => {
  res.render('portal/login', { error: null });
});

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await pool.query(`SELECT * FROM club_users WHERE email = $1`, [email]);

  if (!rows.length) {
    return res.render('portal/login', { error: 'Incorrect email or password.' });
  }

  const match = await bcrypt.compare(password || '', rows[0].password_hash);
  if (!match) {
    return res.render('portal/login', { error: 'Incorrect email or password.' });
  }

  req.session.clubUserId = rows[0].id;
  res.redirect('/club-portal');
}));

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/club-portal/login'));
});

// ---------- Dashboard ----------
router.get('/', requireClubLogin, requireApprovedClub, asyncHandler(async (req, res) => {
  const { rows: events } = await pool.query(
    `SELECT id, title, slug, date_start, status FROM events
     WHERE club_id = $1 ORDER BY date_start DESC`,
    [req.clubUser.club_id]
  );
  res.render('portal/dashboard', { clubUser: req.clubUser, events });
}));

// ---------- Events (scoped to the logged-in club) ----------
router.get('/events/new', requireClubLogin, requireApprovedClub, (req, res) => {
  res.render('portal/event-form', { clubUser: req.clubUser, event: {}, isNew: true });
});

router.post('/events', requireClubLogin, requireApprovedClub, asyncHandler(async (req, res) => {
  const b = req.body;
  const slug = slugify(`${b.title}-${req.clubUser.club_name}-${b.date_start}`);

  const { rows } = await pool.query(
    `INSERT INTO events (
      title, slug, club_id, date_start, format, age_category, gender,
      entry_fee, entry_deadline, entry_url, entry_email, entry_phone,
      hcp_allowance_info, catering, prizes, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'confirmed')
     RETURNING id`,
    [
      b.title, slug, req.clubUser.club_id, b.date_start, b.format || null,
      b.age_category || null, b.gender || null, b.entry_fee || null,
      b.entry_deadline || null, b.entry_url || null, b.entry_email || null,
      b.entry_phone || null, b.hcp_allowance_info || null, b.catering || null, b.prizes || null
    ]
  );

  res.redirect(`/club-portal/events/${rows[0].id}/edit`);
}));

router.get('/events/:id/edit', requireClubLogin, requireApprovedClub, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM events WHERE id = $1 AND club_id = $2`,
    [req.params.id, req.clubUser.club_id]
  );
  if (!rows.length) return res.status(404).send('Event not found, or it belongs to a different club.');
  res.render('portal/event-form', { clubUser: req.clubUser, event: rows[0], isNew: false });
}));

router.post('/events/:id/update', requireClubLogin, requireApprovedClub, asyncHandler(async (req, res) => {
  // Ownership check: only update if this event actually belongs to the
  // logged-in club — prevents editing another club's event by guessing IDs.
  const { rows: owned } = await pool.query(
    `SELECT id FROM events WHERE id = $1 AND club_id = $2`,
    [req.params.id, req.clubUser.club_id]
  );
  if (!owned.length) return res.status(404).send('Event not found, or it belongs to a different club.');

  const b = req.body;
  await pool.query(
    `UPDATE events SET
      title=$1, date_start=$2, format=$3, age_category=$4, gender=$5,
      entry_fee=$6, entry_deadline=$7, entry_url=$8, entry_email=$9, entry_phone=$10,
      hcp_allowance_info=$11, catering=$12, prizes=$13, updated_at=now()
     WHERE id = $14`,
    [
      b.title, b.date_start, b.format || null, b.age_category || null, b.gender || null,
      b.entry_fee || null, b.entry_deadline || null, b.entry_url || null, b.entry_email || null,
      b.entry_phone || null, b.hcp_allowance_info || null, b.catering || null, b.prizes || null,
      req.params.id
    ]
  );

  res.redirect(`/club-portal/events/${req.params.id}/edit?saved=1`);
}));

module.exports = router;
