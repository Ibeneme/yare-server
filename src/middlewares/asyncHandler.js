// Forwards rejected promises to Express' error handler (Express 5 does this too; kept explicit).
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
