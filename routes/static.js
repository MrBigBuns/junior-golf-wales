const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const asyncHandler = require('../lib/asyncHandler');

router.get('/about', (req, res) => {
  res.render('static/about');
});

router.get('/privacy', (req, res) => {
  res.render('static/privacy');
});

router.get('/contact', (req, res) => {
  res.render('static/contact');
});

// Live figures for the "reach" boxes on the sponsorship page
router.get('/sponsorship', asyncHandler(async (req, res) => {
  const [events, clubs] = await Promise.all([
    pool.query(`SELECT COUNT(*) FROM events WHERE date_start >= CURRENT_DATE AND status != 'cancelled'`),
    pool.query(`SELECT COUNT(*) FROM clubs WHERE archived_at IS NULL`)
  ]);
  res.render('static/sponsorship', {
    reach: { events: Number(events.rows[0].count), clubs: Number(clubs.rows[0].count) }
  });
}));

// The link in the Instagram bio: the events added most recently, each one
// tap away from its details. Not indexed; it exists for the bio link.
router.get('/instagram', asyncHandler(async (req, res) => {
  const social = require('../lib/social');
  const events = (await social.recentEvents(pool, 12)).map(ev => ({
    ...ev, card: social.eventCardData(ev), added: ev.created_at
  }));
  res.render('static/instagram', { events, noIndex: true });
}));

module.exports = router;
