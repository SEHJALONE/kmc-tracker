// Schedule listing/cancellation endpoint.
// NOTE: Vercel serverless functions are stateless — schedules stored here won't
// persist across requests. For recurring sends, configure Vercel Cron Jobs in
// vercel.json and store schedule config in Vercel KV or an external store.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    return res.json({ schedules: [], note: 'Persistent schedules require Vercel KV. Use Vercel Cron Jobs for recurring sends.' });
  }

  if (req.method === 'DELETE') {
    return res.json({ ok: true, note: 'No persistent schedules to cancel.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
