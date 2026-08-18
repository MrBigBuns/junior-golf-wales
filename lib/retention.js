// Deletes form submissions for events that finished more than RETENTION_DAYS
// ago. There's no scheduled job running this — it's called opportunistically
// from the admin dashboard on load, which is enough for a small site like
// this without needing a separate cron/worker service. See TODO.md.
const RETENTION_DAYS = 30;

async function purgeOldSubmissions(pool) {
  const { rowCount } = await pool.query(
    `DELETE FROM event_form_submissions
     WHERE event_form_id IN (
       SELECT ef.id FROM event_forms ef
       JOIN events e ON e.id = ef.event_id
       WHERE e.date_start < CURRENT_DATE - INTERVAL '${RETENTION_DAYS} days'
     )`
  );
  if (rowCount > 0) {
    console.log(`Retention sweep: purged ${rowCount} form submission(s) for events over ${RETENTION_DAYS} days old.`);
  }
  return rowCount;
}

module.exports = { purgeOldSubmissions, RETENTION_DAYS };
