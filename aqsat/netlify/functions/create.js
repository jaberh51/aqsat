const crypto = require('crypto');
const R = async (cmd) => {
  const res = await fetch(process.env.UPSTASH_REDIS_REST_URL + cmd, {
    headers: { Authorization: 'Bearer ' + process.env.UPSTASH_REDIS_REST_TOKEN }
  });
  return res.json();
};
const resp = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(obj)
});
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return resp(405, { error: 'method' });
  let b;
  try { b = JSON.parse(event.body || '{}'); }
  catch { return resp(400, { error: 'bad' }); }
  const ip = ((event.headers['x-forwarded-for'] || '').split(',')[0] || 'x').trim();
  const rlKey = 'rl:' + encodeURIComponent(ip);
  const rl = await R('/incr/' + rlKey);
  if (rl.result === 1) await R('/expire/' + rlKey + '/300');
  if (rl.result > 15) return resp(429, { error: 'locked' });
  const hash = crypto.pbkdf2Sync(
    String(b.pin || ''),
    Buffer.from(process.env.PIN_SALT, 'base64'),
    310000, 32, 'sha256'
  ).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const c = Buffer.from(process.env.PIN_HASH, 'hex');
  if (a.length !== c.length || !crypto.timingSafeEqual(a, c))
    return resp(401, { error: 'pin' });
  if (b.check) return resp(200, { ok: true });
  const amount = Number(b.amount);
  if (!isFinite(amount) || amount <= 0 || amount > 1000000)
    return resp(400, { error: 'amount' });
  const minutes = [5, 10, 30, 60].includes(b.minutes) ? b.minutes : 5;
  const maxOpens = [1, 2].includes(b.maxOpens) ? b.maxOpens : 1;
  const note = String(b.note || '').slice(0, 120);
  const id = crypto.randomBytes(9).toString('base64url');
  const data = {
    a: Math.round(amount * 100) / 100,
    m: note,
    o: maxOpens,
    exp: Date.now() + minutes * 60000
  };
  const ttl = minutes * 60;
  await R('/set/d:' + id + '/' + encodeURIComponent(JSON.stringify(data)) + '?EX=' + ttl);
  return resp(200, { id, o: maxOpens, minutes });
};
