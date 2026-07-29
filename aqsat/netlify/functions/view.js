// netlify/functions/view.js
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    const id = event.queryStringParameters?.id;
    const clientToken = event.queryStringParameters?.t;

    if (!id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing ID' }) };
    }

    const store = getStore('installments');
    const dataRaw = await store.get(id);

    // إذا كان الرابط غير موجود أو محذوف
    if (!dataRaw) {
      return { statusCode: 410, headers, body: JSON.stringify({ error: 'Expired or Gone' }) };
    }

    let data;
    try {
      data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
    } catch (e) {
      return { statusCode: 410, headers, body: JSON.stringify({ error: 'Corrupt Data' }) };
    }

    // حساب الوقت المتبقي
    const now = Date.now();
    const left = data.exp - now;

    if (left <= 0) {
      await store.delete(id); // مسح البيانات عند الانتهاء
      return { statusCode: 410, headers, body: JSON.stringify({ error: 'Expired' }) };
    }

    // إدارة التوكن والتأكد من فتح الرابط على نفس الجهاز
    if (!data.token) {
      // المرة الأولى: تسجيل التوكن للجهاز
      data.token = clientToken;
      await store.set(id, JSON.stringify(data));
    } else if (data.token !== clientToken) {
      // إذا فتح من جهاز مختلف
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Device Mismatch' }) };
    }

    // إرجاع البيانات بنجاح (المرة الأولى والمرة الثانية)
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        a: data.amount,
        m: data.note || '',
        left: left
      })
    };

  } catch (err) {
    // حماية الدالة من الانهيار
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server Error', details: err.message })
    };
  }
};
