const express = require('express');
const router = express.Router();

router.get('/about', (req, res) => {
  res.render('static/about');
});

router.get('/privacy', (req, res) => {
  res.render('static/privacy');
});

router.get('/contact', (req, res) => {
  res.render('static/contact');
});

router.get('/sponsorship', (req, res) => {
  res.render('static/sponsorship');
});

module.exports = router;
