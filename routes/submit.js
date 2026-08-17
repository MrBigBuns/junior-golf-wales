const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

router.get('/', (req, res) => {
  res.render('submit', { submitted: false });
});

router.post('/', async (req, res) => {
  const { event_title, club_name, event_date, entry_fee, entry_info, contact_email, notes } = req.body;

  if (!event_title || !club_name || !event_date || !contact_email) {
    return res.render('submit', {
      submitted: false,
      error: 'Please fill in event name, club, date and your email.'
    });
  }

  await pool.query(
    `INSERT INTO submissions (raw_data, submitted_by_email)
     VALUES ($1, $2)`,
    [
      JSON.stringify({ event_title, club_name, event_date, entry_fee, entry_info, notes }),
      contact_email
    ]
  );

  res.render('submit', { submitted: true });
});

module.exports = router;
