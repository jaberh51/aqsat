// دالة التحقق: هل فتح الزبون الرابط؟ (قراءة فقط، محمية بالرمز)
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

  const hash = crypto.pbkdf2Sync(
    String(b.pin || ''),
    Buffer.from(process.env.PIN_SALT, 'base64'),
    310000, 32, 'sha256'
  ).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const c = Buffer.from(process.env.PIN_HASH, 'hex');
  if (a.length !== c.length || !crypto.timingSafeEqual(a, c))
    return resp(401, { error: 'pin' });

  const id = String(b.id || '');
  if (!/^[A-Za-z0-9_-]{6,24}$/.test(id)) return resp(400, { error: 'badid' });

  const d = await R('/get/d:' + id);
  const exists = !!(d && d.result);
  const owner = await R('/get/own:' + id);
  const opened = !!(owner && owner.result);

  return resp(200, { exists, opened });
};
