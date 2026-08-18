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

app.listen(PORT, () => console.log(`Junior Golf Wales running on port ${PORT}`));
