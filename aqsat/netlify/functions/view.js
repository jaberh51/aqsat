// دالة عرض الرابط — تعدّ مرات الفتح وتحذف البيانات نهائيًا عند تجاوز الحد أو انتهاء الوقت
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
  const id = (event.queryStringParameters || {}).id || '';
  if (!/^[A-Za-z0-9_-]{6,24}$/.test(id)) return resp(410, { error: 'gone' });

  const g = await R('/get/d:' + id);
  if (!g.result) return resp(410, { error: 'gone' });

  let data;
  try { data = JSON.parse(g.result); }
  catch { return resp(410, { error: 'gone' }); }

  // انتهى الوقت؟ حذف فوري (شبكة أمان فوق الحذف التلقائي)
  if (Date.now() >= data.exp) {
    await R('/del/d:' + id);
    await R('/del/c:' + id);
    return resp(410, { error: 'gone' });
  }

  // عدّ الفتحات — قلب ميزة "مرة واحدة فقط"
  const c = await R('/incr/c:' + id);
  if (c.result === 1) {
    const ttl = Math.max(60, Math.ceil((data.exp - Date.now()) / 1000) + 60);
    await R('/expire/c:' + id + '/' + ttl);
  }
  if (c.result > data.o) {
    // تجاوز عدد الفتحات المسموح: حذف نهائي من المصدر
    await R('/del/d:' + id);
    await R('/del/c:' + id);
    return resp(410, { error: 'gone' });
  }

  return resp(200, {
    a: data.a,
    m: data.m,
    left: Math.max(0, data.exp - Date.now())
  });
};
