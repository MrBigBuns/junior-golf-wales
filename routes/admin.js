const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const asyncHandler = require('../lib/asyncHandler');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const { geocodeAddress } = require('../lib/geocode');

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Fields that hold JSON and need parsing from a textarea on save
function parseJsonField(value) {
  if (!value || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch (e) {
    return { __parse_error: e.message, __raw: value };
  }
}

// ---------- Dashboard ----------
router.get('/', asyncHandler(async (req, res) => {
  const [{ rows: eventCount }, { rows: clubCount }, { rows: pendingCount }, { rows: pendingClubAccounts }] = await Promise.all([
    pool.query(`SELECT COUNT(*) FROM events`),
    pool.query(`SELECT COUNT(*) FROM clubs`),
    pool.query(`SELECT COUNT(*) FROM submissions WHERE status = 'pending'`),
    pool.query(`SELECT COUNT(*) FROM club_users WHERE status = 'pending'`)
  ]);
  res.render('admin/dashboard', {
    eventCount: eventCount[0].count,
    clubCount: clubCount[0].count,
    pendingCount: pendingCount[0].count,
    pendingClubAccounts: pendingClubAccounts[0].count
  });
}));

// ---------- Events ----------
router.get('/events', asyncHandler(async (req, res) => {
  const { rows: events } = await pool.query(
    `SELECT e.id, e.title, e.slug, e.date_start, e.status, c.name AS club_name
     FROM events e JOIN clubs c ON c.id = e.club_id
     ORDER BY e.date_start DESC`
  );
  res.render('admin/events-list', { events });
}));

router.get('/events/new', asyncHandler(async (req, res) => {
  const { rows: clubs } = await pool.query(`SELECT id, name FROM clubs ORDER BY name`);
  const { rows: organisers } = await pool.query(`SELECT id, name FROM organisers ORDER BY name`);
  res.render('admin/event-form', { event: {}, clubs, organisers, isNew: true });
}));

router.post('/events', asyncHandler(async (req, res) => {
  const b = req.body;
  const slug = b.slug ? slugify(b.slug) : slugify(`${b.title}-${b.club_name_hint || ''}-${b.date_start}`);

  const { rows } = await pool.query(
    `INSERT INTO events (
      title, slug, club_id, organiser_id, date_start, date_end, start_time,
      age_category, age_cutoff_date, gender, format, holes, junior_tees_note,
      entry_fee, entry_deadline, registration_opens, accompanying_adult_required,
      organiser_contact, hcp_allowance_info, hcp_index_limit, catering, prizes,
      yardage, par, entry_url, entry_email, entry_phone, entry_fee_tiers,
      scorecard, status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
    RETURNING id`,
    [
      b.title, slug, b.club_id || null, b.organiser_id || null, b.date_start, b.date_end || null, b.start_time || null,
      b.age_category || null, b.age_cutoff_date || null, b.gender || null, b.format || null, b.holes || null, b.junior_tees_note || null,
      b.entry_fee || null, b.entry_deadline || null, b.registration_opens || null, b.accompanying_adult_required === 'on',
      b.organiser_contact || null, b.hcp_allowance_info || null, b.hcp_index_limit || null, b.catering || null, b.prizes || null,
      b.yardage || null, b.par || null, b.entry_url || null, b.entry_email || null, b.entry_phone || null,
      JSON.stringify(parseJsonField(b.entry_fee_tiers)),
      JSON.stringify(parseJsonField(b.scorecard)),
      b.status || 'confirmed'
    ]
  );

  res.redirect(`/admin/events/${rows[0].id}/edit`);
}));

router.get('/events/:id/edit', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM events WHERE id = $1`, [req.params.id]);
  if (!rows.length) return res.status(404).send('Event not found');
  const { rows: clubs } = await pool.query(`SELECT id, name FROM clubs ORDER BY name`);
  const { rows: organisers } = await pool.query(`SELECT id, name FROM organisers ORDER BY name`);
  const { rows: updates } = await pool.query(
    `SELECT * FROM event_updates WHERE event_id = $1 ORDER BY created_at DESC`,
    [req.params.id]
  );
  res.render('admin/event-form', { event: rows[0], clubs, organisers, isNew: false, updates });
}));

router.post('/events/:id/update', asyncHandler(async (req, res) => {
  const b = req.body;
  const slug = slugify(b.slug);

  await pool.query(
    `UPDATE events SET
      title=$1, slug=$2, club_id=$3, organiser_id=$4, date_start=$5, date_end=$6, start_time=$7,
      age_category=$8, age_cutoff_date=$9, gender=$10, format=$11, holes=$12, junior_tees_note=$13,
      entry_fee=$14, entry_deadline=$15, registration_opens=$16, accompanying_adult_required=$17,
      organiser_contact=$18, hcp_allowance_info=$19, hcp_index_limit=$20, catering=$21, prizes=$22,
      yardage=$23, par=$24, entry_url=$25, entry_email=$26, entry_phone=$27, entry_fee_tiers=$28,
      scorecard=$29, status=$30, updated_at=now()
     WHERE id = $31`,
    [
      b.title, slug, b.club_id || null, b.organiser_id || null, b.date_start, b.date_end || null, b.start_time || null,
      b.age_category || null, b.age_cutoff_date || null, b.gender || null, b.format || null, b.holes || null, b.junior_tees_note || null,
      b.entry_fee || null, b.entry_deadline || null, b.registration_opens || null, b.accompanying_adult_required === 'on',
      b.organiser_contact || null, b.hcp_allowance_info || null, b.hcp_index_limit || null, b.catering || null, b.prizes || null,
      b.yardage || null, b.par || null, b.entry_url || null, b.entry_email || null, b.entry_phone || null,
      JSON.stringify(parseJsonField(b.entry_fee_tiers)),
      JSON.stringify(parseJsonField(b.scorecard)),
      b.status || 'confirmed',
      req.params.id
    ]
  );

  res.redirect(`/admin/events/${req.params.id}/edit?saved=1`);
}));

router.post('/events/:id/delete', asyncHandler(async (req, res) => {
  await pool.query(`DELETE FROM events WHERE id = $1`, [req.params.id]);
  res.redirect('/admin/events');
}));

router.post('/events/:id/add-update', asyncHandler(async (req, res) => {
  if (req.body.message && req.body.message.trim()) {
    await pool.query(
      `INSERT INTO event_updates (event_id, message) VALUES ($1, $2)`,
      [req.params.id, req.body.message.trim()]
    );
  }
  res.redirect(`/admin/events/${req.params.id}/edit`);
}));

// ---------- Scorecard import (photo -> structured JSON via Claude vision) ----------
router.get('/events/:id/scorecard-import', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`SELECT id, title FROM events WHERE id = $1`, [req.params.id]);
  if (!rows.length) return res.status(404).send('Event not found');
  res.render('admin/scorecard-import', { event: rows[0], error: null });
}));

router.post('/events/:id/scorecard-import', upload.single('scorecard_image'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`SELECT id, title FROM events WHERE id = $1`, [req.params.id]);
  if (!rows.length) return res.status(404).send('Event not found');

  if (!req.file) {
    return res.render('admin/scorecard-import', { event: rows[0], error: 'Choose an image first.' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.render('admin/scorecard-import', {
      event: rows[0],
      error: 'ANTHROPIC_API_KEY is not set on this server — add it under Render > Environment before using this tool.'
    });
  }

  try {
    const base64 = req.file.buffer.toString('base64');
    const mediaType = req.file.mimetype;

    const prompt = `This is a photo of a golf scorecard. Extract every hole you can read into a JSON array, one object per hole, in this exact shape:

[{"hole": 1, "par": 4, "strokeIndex": 13, "yards": {"white": 319, "yellow": 296, "red": 254}}, ...]

Rules:
- "hole" is the hole number (1-18).
- "par" is the par for that hole.
- "strokeIndex" is the stroke index / S.I. for that hole, if shown.
- "yards" should have one key per tee colour actually visible on the card (e.g. white, yellow, red, blue, black) — use lowercase colour names as keys. Only include tees that are actually printed on the card.
- Only include holes you can actually read. If a value is illegible, omit that field for that hole rather than guessing.
- Respond with ONLY the JSON array — no markdown fences, no commentary, no explanation.`;

    const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      throw new Error(`Anthropic API error (${apiResponse.status}): ${errText.slice(0, 300)}`);
    }

    const data = await apiResponse.json();
    const textBlock = (data.content || []).find(b => b.type === 'text');
    const rawText = textBlock ? textBlock.text.trim() : '';

    // Strip markdown fences if Claude added them despite instructions
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');

    let parsed;
    let parseError = null;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      parseError = e.message;
      parsed = null;
    }

    res.render('admin/scorecard-review', {
      event: rows[0],
      rawText: cleaned,
      parsed,
      parseError,
      holeCount: parsed ? parsed.length : 0
    });
  } catch (err) {
    res.render('admin/scorecard-import', { event: rows[0], error: err.message });
  }
}));

router.post('/events/:id/scorecard-import/save', asyncHandler(async (req, res) => {
  const parsedField = parseJsonField(req.body.scorecard_json);
  if (parsedField && !parsedField.__parse_error) {
    await pool.query(`UPDATE events SET scorecard = $1 WHERE id = $2`, [JSON.stringify(parsedField), req.params.id]);
  }
  res.redirect(`/admin/events/${req.params.id}/edit`);
}));

// ---------- Clubs ----------
router.get('/clubs', asyncHandler(async (req, res) => {
  const { rows: clubs } = await pool.query(`SELECT id, name, slug, region FROM clubs ORDER BY name`);
  res.render('admin/clubs-list', { clubs });
}));

router.get('/clubs/new', (req, res) => {
  res.render('admin/club-form', { club: {}, isNew: true });
});

router.post('/clubs', asyncHandler(async (req, res) => {
  const b = req.body;
  const slug = b.slug ? slugify(b.slug) : slugify(b.name);

  let lat = b.lat || null;
  let lng = b.lng || null;
  if (!lat && !lng && b.address) {
    const geo = await geocodeAddress(b.address);
    if (geo) { lat = geo.lat; lng = geo.lng; }
  }

  const { rows } = await pool.query(
    `INSERT INTO clubs (name, slug, address, region, lat, lng, website, contact_email, junior_membership_contact, logo_url, description, course_image_url, facebook_url, instagram_url, x_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
    [
      b.name, slug, b.address || null, b.region || null, lat, lng,
      b.website || null, b.contact_email || null, b.junior_membership_contact || null,
      b.logo_url || null, b.description || null, b.course_image_url || null,
      b.facebook_url || null, b.instagram_url || null, b.x_url || null
    ]
  );

  res.redirect(`/admin/clubs/${rows[0].id}/edit`);
}));

router.get('/clubs/:id/edit', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM clubs WHERE id = $1`, [req.params.id]);
  if (!rows.length) return res.status(404).send('Club not found');
  res.render('admin/club-form', { club: rows[0], isNew: false });
}));

router.post('/clubs/:id/update', asyncHandler(async (req, res) => {
  const b = req.body;
  const slug = slugify(b.slug);

  let lat = b.lat || null;
  let lng = b.lng || null;
  if (!lat && !lng && b.address) {
    const geo = await geocodeAddress(b.address);
    if (geo) { lat = geo.lat; lng = geo.lng; }
  }

  await pool.query(
    `UPDATE clubs SET name=$1, slug=$2, address=$3, region=$4, lat=$5, lng=$6, website=$7,
      contact_email=$8, junior_membership_contact=$9, logo_url=$10, description=$11, course_image_url=$12,
      facebook_url=$13, instagram_url=$14, x_url=$15
     WHERE id = $16`,
    [
      b.name, slug, b.address || null, b.region || null, lat, lng,
      b.website || null, b.contact_email || null, b.junior_membership_contact || null,
      b.logo_url || null, b.description || null, b.course_image_url || null,
      b.facebook_url || null, b.instagram_url || null, b.x_url || null,
      req.params.id
    ]
  );

  res.redirect(`/admin/clubs/${req.params.id}/edit?saved=1`);
}));

router.post('/clubs/:id/delete', asyncHandler(async (req, res) => {
  await pool.query(`DELETE FROM clubs WHERE id = $1`, [req.params.id]);
  res.redirect('/admin/clubs');
}));

// ---------- Submissions ----------
router.get('/submissions', asyncHandler(async (req, res) => {
  const { rows: submissions } = await pool.query(
    `SELECT * FROM submissions ORDER BY created_at DESC LIMIT 100`
  );
  res.render('admin/submissions', { submissions });
}));

router.post('/submissions/:id/status', asyncHandler(async (req, res) => {
  const status = req.body.status === 'approved' ? 'approved' : 'rejected';
  await pool.query(`UPDATE submissions SET status = $1 WHERE id = $2`, [status, req.params.id]);
  res.redirect('/admin/submissions');
}));

// ---------- Club accounts (portal sign-ups) ----------
router.get('/club-accounts', asyncHandler(async (req, res) => {
  const { rows: accounts } = await pool.query(
    `SELECT cu.*, c.name AS club_name FROM club_users cu
     JOIN clubs c ON c.id = cu.club_id
     ORDER BY (cu.status = 'pending') DESC, cu.created_at DESC`
  );
  res.render('admin/club-accounts', { accounts });
}));

router.post('/club-accounts/:id/status', asyncHandler(async (req, res) => {
  const status = req.body.status === 'approved' ? 'approved' : 'rejected';
  await pool.query(`UPDATE club_users SET status = $1 WHERE id = $2`, [status, req.params.id]);
  res.redirect('/admin/club-accounts');
}));

module.exports = router;
