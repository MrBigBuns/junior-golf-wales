// Express 4 does not automatically catch rejected promises from async route
// handlers — an unhandled rejection in an async handler crashes the entire
// Node process (not just that one request), taking the whole site down.
// Wrap every async handler with this so errors go to the error-handling
// middleware in server.js instead.
module.exports = function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
