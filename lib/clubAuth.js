const pool = require('../db/pool');

// Requires a logged-in club user (any status). Loads fresh from DB each
// request rather than trusting the session, so a rejected/pending account
// can't keep acting on a stale "approved" session value.
async function requireClubLogin(req, res, next) {
  if (!req.session || !req.session.clubUserId) {
    return res.redirect('/club-portal/login');
  }

  const { rows } = await pool.query(
    `SELECT cu.*, c.name AS club_name, c.slug AS club_slug
     FROM club_users cu JOIN clubs c ON c.id = cu.club_id
     WHERE cu.id = $1`,
    [req.session.clubUserId]
  );

  if (!rows.length) {
    req.session.destroy(() => {});
    return res.redirect('/club-portal/login');
  }

  req.clubUser = rows[0];
  next();
}

// Requires login AND an approved account. Use after requireClubLogin.
function requireApprovedClub(req, res, next) {
  if (req.clubUser.status !== 'approved') {
    return res.render('portal/pending', { clubUser: req.clubUser });
  }
  next();
}

module.exports = { requireClubLogin, requireApprovedClub };
