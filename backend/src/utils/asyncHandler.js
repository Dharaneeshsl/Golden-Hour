/**
 * Express Async Error Handler Wrapper (Bug #8 Fix)
 * Ensures unhandled rejections in async route handlers are caught
 * and passed to Express next() error middleware without hanging requests.
 */
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
