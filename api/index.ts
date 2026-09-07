import app from '../server.js';

export default function handler(req: any, res: any) {
  // If Vercel rewrites stripped '/api' from req.url, prepend '/api' so Express routes match
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  return app(req, res);
}
