// Single API gateway for Telegram Mini App; Telegram identity is verified in Apps Script.
// The Apps Script deployment URL is public configuration, not a credential.
const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbziuYcwWMhkJraJS_fXMuFkKrL1UXdcVCSJzIJyhvuMWO6CbjDmtQJcrk0y2fmRY2wzeQ/exec';
const ACTIONS = new Set(['bootstrap', 'month', 'save', 'section', 'manage']);
const noCache = { 'Cache-Control': 'no-store' };

function failure(message, status) {
  return Response.json({ ok: false, error: message }, { status, headers: noCache });
}

async function forward(body, action) {
  // A ContentService reply normally redirects to script.googleusercontent.com.
  // Retry *reads only* if the redirect fails or Google temporarily returns HTML.
  // Never replay a write after an ambiguous response.
  const attempts = action === 'save' || action === 'manage' ? 1 : 2;
  const payload = JSON.stringify({ ...body, kind: 'fast_app_api' });
  for (let attempt = 0; attempt < attempts; attempt++) {
    let upstream;
    try {
      upstream = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: payload,
        redirect: 'follow',
        signal: AbortSignal.timeout(22000)
      });
      const raw = await upstream.text();
      let parsed;
      try { parsed = JSON.parse(raw); } catch (_) {}
      if (upstream.ok && parsed && typeof parsed.ok === 'boolean') {
        return Response.json(parsed, {
          status: parsed.ok ? 200 : 400,
          headers: noCache
        });
      }
      // Do not emit raw upstream HTML or Telegram initData into logs.
      let host = 'unknown';
      try { host = new URL(upstream.url).hostname; } catch (_) {}
      console.error('Davomat upstream transport:', JSON.stringify({
        attempt: attempt + 1,
        action, status: upstream.status, host,
        type: upstream.headers.get('content-type') || 'unknown',
        responseClass: parsed ? 'unexpected-json' : 'not-json'
      }));
      if (attempt + 1 === attempts) {
        return failure(
          (action === 'save' || action === 'manage')
            ? 'Javob olinmadi. Qayta saqlashdan oldin davomatni tekşiring.'
            : 'Davomatni yüklab bo‘lmadi. Qayta ochib ko‘ring.',
          502
        );
      }
    } catch (error) {
      console.error('Davomat upstream connection:', JSON.stringify({
        action, attempt: attempt + 1, kind: error?.name || 'error'
      }));
      if (attempt + 1 === attempts) {
        return failure(
          (action === 'save' || action === 'manage')
            ? 'Saqlash javobi olinmadi. Davomatni tekşirib ko‘ring.'
            : 'Davomat serveri bilan aloqa vaqtincha uzildi.',
          error?.name === 'TimeoutError' ? 504 : 502
        );
      }
    }
  }
  return failure('Davomat serveri vaqtincha işlamayapti.', 502);
}

export default async function handler(request) {
  if (request.method !== 'POST') return failure('Bu amal mavjud emas.', 405);
  try {
    const text = await request.text();
    if (text.length > 150000) return failure('So‘rov hajmi juda katta.', 413);
    const body = JSON.parse(text);
    if (!body || !ACTIONS.has(body.action) || typeof body.initData !== 'string') {
      return failure('Ma’lumot noto‘g‘ri yuborildi.', 400);
    }
    return await forward(body, body.action);
  } catch (error) {
    console.error('Davomat proxy request:', error?.name || 'error');
    return failure('So‘rovni bajarib bo‘lmadi.', 400);
  }
}

export const config = { path: '/api/attendance' };
