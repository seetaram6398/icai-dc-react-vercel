// Vercel serverless entry point.
// The exported Express app handles every request routed here by vercel.json
// (the /api/* and /documents/* paths). The original request path is preserved,
// so the app's existing routes match as-is.
module.exports = require('../backend/src/server');
