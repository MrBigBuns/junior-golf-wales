// Whether entries for an event are open yet, for the event page's button.
//   open       show the normal entry button
//   countdown  an opening date is set and still ahead: "Entries open in N days"
//   soon       no opening date, but admin has ticked "Entries not open yet"
//   closed     "Entries closed": admin has ticked "Entries closed or full", the
//              entry deadline has passed, or the event itself has been played
// Closed wins over the opening-date logic below.
// A set opening date always decides (the tick box is only for events with no
// date), so the button switches to "Enter this event" by itself on the day.
// Dates are compared as London calendar days.

function londonToday(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now); // YYYY-MM-DD
}

function isoDay(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function entryStatus(event, now = new Date()) {
  const today = londonToday(now);
  const deadline = isoDay(event.entry_deadline);
  const played = isoDay(event.date_start);
  if (event.entries_closed) return { state: 'closed', label: 'Entries closed' };
  if (deadline && deadline < today) return { state: 'closed', label: 'Entries closed', closedOn: deadline };
  if (played && played < today) return { state: 'closed', label: 'Entries closed' };

  const opens = isoDay(event.registration_opens);
  if (opens) {
    const days = Math.round((Date.parse(opens) - Date.parse(today)) / 86400000);
    if (days > 0) {
      return {
        state: 'countdown',
        days,
        label: days === 1 ? 'Entries open tomorrow' : `Entries open in ${days} days`,
        opens
      };
    }
    return { state: 'open' };
  }
  if (event.entries_not_open) return { state: 'soon', label: 'Entries open soon' };
  return { state: 'open' };
}

module.exports = { entryStatus };
