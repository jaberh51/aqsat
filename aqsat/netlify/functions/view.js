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

    if (!dataRaw) {
      return { statusCode: 410, headers, body: JSON.stringify({ error: 'Expired or Gone' }) };
    }

    let data;
    try {
      data = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
    } catch (e) {
      return { statusCode: 410, headers, body: JSON.stringify({ error: 'Corrupt Data' }) };
    }

    const now = Date.now();
    
    // دعم كافة أسماء الحقول المحتملة لتاريخ الانتهاء لمنع الخطأ
    let expireTime = data.exp || data.expiresAt || data.expires;
    if (!expireTime && data.createdAt && data.minutes) {
      expireTime = data.createdAt + (data.minutes * 60 * 1000);
    }

    // إذا لم نجد تاريخ انتهاء إطلاقاً، نضع افتراضياً 30 دقيقة للأمان
    if (!expireTime) {
      expireTime = now + (30 * 60 * 1000);
    }

    const left = expireTime - now;

    if (left <= 0) {
      await store.delete(id);
      return { statusCode: 410, headers, body: JSON.stringify({ error: 'Expired' }) };
    }

    // التحقق من التوكن بدون القضاء على الجلسة
    if (!data.token && clientToken) {
      data.token = clientToken;
      await store.set(id, JSON.stringify(data));
    } else if (data.token && clientToken && data.token !== clientToken) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Device Mismatch' }) };
    }

    // إرجاع البيانات لدعم أكثر من اسم للمبلغ والملاحظة
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        a: data.amount !== undefined ? data.amount : data.a,
        m: data.note !== undefined ? data.note : (data.m || ''),
        left: left
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server Error', details: err.message })
    };
  }
};
