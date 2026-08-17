require('dotenv').config();
const express = require('express');
const path = require('path');

const eventsRouter = require('./routes/events');
const clubsRouter = require('./routes/clubs');
const submitRouter = require('./routes/submit');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => res.redirect('/events'));
app.use('/events', eventsRouter);
app.use('/clubs', clubsRouter);
app.use('/submit-event', submitRouter);

app.use((req, res) => res.status(404).render('404'));

app.listen(PORT, () => console.log(`Junior Golf Wales running on port ${PORT}`));
