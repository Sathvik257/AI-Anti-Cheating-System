import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const app = require('../AI-Exam/backend-code/app.js');

export default function handler(req, res) {
  if (!req.url.startsWith('/api')) {
    req.url = `/api${req.url}`;
  }

  return app(req, res);
}
