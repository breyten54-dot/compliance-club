// Vercel serverless entry.
// Vercel invokes Node functions with (req, res), so we export the Express app
// directly — wrapping it in serverless-http (AWS Lambda style) never writes a
// response on Vercel and the request hangs until the gateway times out.
//
// The app in src/index.js carries everything: /api/* JSON routes, the
// server-rendered /portal/* member pages (login, dashboard, CPD, alerts,
// AI advisor) and /admin/*. vercel.json rewrites those paths here.
module.exports = require('../src/index');
