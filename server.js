require('dotenv').config();
const express = require('express');
const path = require('path');

const homeRouter = require('./routes/home');
const eventsRouter = require('./routes/events');
const clubsRouter = require('./routes/clubs');
const toursRouter = require('./routes/tours');
const submitRouter = require('./routes/submit');
const adminRouter = require('./routes/admin');
const mapRouter = require('./routes/map');
const staticRouter = require('./routes/static');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

app.use('/', homeRouter);
app.use('/events', eventsRouter);
app.use('/clubs', clubsRouter);
app.use('/tours', toursRouter);
app.use('/submit-event', submitRouter);
app.use('/admin', adminRouter);
app.use('/map', mapRouter);
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
