require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const homeRouter = require('./routes/home');
const eventsRouter = require('./routes/events');
const clubsRouter = require('./routes/clubs');
const toursRouter = require('./routes/tours');
const submitRouter = require('./routes/submit');
const adminRouter = require('./routes/admin');
const mapRouter = require('./routes/map');
const staticRouter = require('./routes/static');
const portalRouter = require('./routes/portal');
const adminAuth = require('./lib/adminAuth');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Sessions for the club portal login. Uses the default in-memory store —
// fine for this app's scale, but sessions are lost on every restart/deploy
// (club users will need to log back in). Move to a persistent store
// (e.g. connect-pg-simple) if that becomes annoying.
if (!process.env.SESSION_SECRET) {
  console.warn('WARNING: SESSION_SECRET is not set — using an insecure default. Set it in Render > Environment.');
}
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
}));

app.use('/', homeRouter);
app.use('/events', eventsRouter);
app.use('/clubs', clubsRouter);
app.use('/tours', toursRouter);
app.use('/submit-event', submitRouter);
app.use('/admin', adminAuth, adminRouter);
app.use('/map', mapRouter);
app.use('/club-portal', portalRouter);
app.use('/', staticRouter);

app.use((req, res) => res.status(404).render('404'));

// Catches errors forwarded by asyncHandler-wrapped routes. Without this,
// an error in any single request would crash the whole process (Express 4
// does not auto-catch rejected promises from async handlers).
app.use((err, req, res, next) => {
  console.error('Request error:', err);
  res.status(500).send('Something went wrong loading this page. Please try again.');
});

// Last-resort safety nets: log and keep running rather than crash the whole
// site on an error that somehow wasn't caught above.
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));

app.listen(PORT, () => console.log(`Junior Golf Wales running on port ${PORT}`));
