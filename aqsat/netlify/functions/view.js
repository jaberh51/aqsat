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
  const qs = event.queryStringParameters || {};
  const id = qs.id || '';
  const token = (qs.t || '').trim();
  if (!/^[A-Za-z0-9_-]{6,24}$/.test(id)) return resp(410, { error: 'gone' });
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) return resp(400, { error: 'notoken' });

  const g = await R('/get/d:' + id);
  if (!g.result) return resp(410, { error: 'gone' });
  let data;
  try { data = JSON.parse(g.result); }
  catch { return resp(410, { error: 'gone' }); }

  if (Date.now() >= data.exp) {
    await R('/del/d:' + id);
    await R('/del/own:' + id);
    return resp(410, { error: 'gone' });
  }

  const remainSec = Math.max(1, Math.ceil((data.exp - Date.now()) / 1000) + 5);

  // محاولة حجز الجهاز المالك (أول من يفتح الرابط) — بأمر ذرّي SETNX
  const claim = await R('/setnx/own:' + id + '/' + encodeURIComponent(token));
  if (claim && claim.result === 1) {
    await R('/expire/own:' + id + '/' + remainSec);
  } else if (claim && claim.result === 0) {
    const owner = await R('/get/own:' + id);
    if (!owner.result || owner.result !== token) {
      return resp(403, { error: 'device' });
    }
  } else {
    // مسار احتياطي إن لم يُدعم SETNX: تحقق واحجز يدويًا
    const owner = await R('/get/own:' + id);
    if (!owner.result) {
      await R('/set/own:' + id + '/' + encodeURIComponent(token) + '?EX=' + remainSec);
    } else if (owner.result !== token) {
      return resp(403, { error: 'device' });
    }
  }

  return resp(200, {
    a: data.a,
    m: data.m,
    left: Math.max(0, data.exp - Date.now())
  });
};
