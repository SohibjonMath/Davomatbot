// Same-origin API proxy for Telegram's Mini App. Telegram identity and
// school permissions are verified in Apps Script using signed initData.
export default async function handler(request) {
  // Temporary read-only transport diagnostic. An invalid identity is used,
  // so Apps Script cannot read or write anyone's attendance data.
  if(request.method==='GET' && new URL(request.url).searchParams.has('transport-check')) {
    const backend='https://script.google.com/macros/s/AKfycbziuYcwWMhkJraJS_fXMuFkKrL1UXdcVCSJzIJyhvuMWO6CbjDmtQJcrk0y2fmRY2wzeQ/exec';
    const body=JSON.stringify({kind:'fast_app_api',action:'bootstrap',initData:'invalid-diagnostic'});
    const check=async (contentType)=>{
      try {
        const response=await fetch(backend,{method:'POST',headers:{'content-type':contentType},body,redirect:'follow',signal:AbortSignal.timeout(20000)});
        const text=await response.text();
        let parsed=null;
        try{parsed=JSON.parse(text);}catch(_error){}
        const hostname=new URL(response.url).hostname;
        return {status:response.status,contentType:response.headers.get('content-type')||'',finalHost:hostname,
          json:!!parsed, applicationResponse:!!parsed && typeof parsed.ok==='boolean',
          htmlLogin:/accounts\.google\.com|signin|sign in|login/i.test(text.slice(0,3000)),
          htmlError:/<html|<!doctype/i.test(text.slice(0,300)),
          sample:parsed?{ok:parsed.ok,error:parsed.error}:text.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').slice(0,160)};
      }catch(error){return {networkError:error?.name||'Error',message:String(error?.message||'').slice(0,100)};}
    };
    const result={json:await check('application/json;charset=UTF-8'),plain:await check('text/plain;charset=utf-8')};
    return Response.json({ok:true,diagnostic:result},{headers:{'Cache-Control':'no-store'}});
  }
  if (request.method !== 'POST') {
    return Response.json({ok:false,error:'Faqat POST qabul qilinadi.'},{status:405});
  }
  // Public Apps Script deployment URL; identity is verified by signed Telegram initData.
  const backend = 'https://script.google.com/macros/s/AKfycbziuYcwWMhkJraJS_fXMuFkKrL1UXdcVCSJzIJyhvuMWO6CbjDmtQJcrk0y2fmRY2wzeQ/exec';
  if (!backend || !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:\?.*)?$/.test(backend)) {
    return Response.json({ok:false,error:'Davomat serveri hali sozlanmagan.'},{status:503});
  }
  try {
    const text=await request.text();
    if(text.length>150000)return Response.json({ok:false,error:'So‘rov hajmi katta.'},{status:413});
    const body=JSON.parse(text);
    if(!body||!['bootstrap','month','save'].includes(body.action)) {
      return Response.json({ok:false,error:'Noto‘g‘ri amal.'},{status:400});
    }
    // One backend call per data load/save; never proxy each UI button press.
    const upstream=await fetch(backend,{
      method:'POST',
      headers:{'content-type':'application/json;charset=UTF-8'},
      body:JSON.stringify({...body,kind:'fast_app_api'}),
      redirect:'follow',
      signal:AbortSignal.timeout(25000)
    });
    if(!upstream.ok)return Response.json({ok:false,error:'Davomat serveri javob bermadi.'},{status:502});
    const raw=await upstream.text();
    let result;
    try{result=JSON.parse(raw);}catch(_error){
      return Response.json({ok:false,error:'Davomat serveridan noto‘g‘ri javob olindi.'},{status:502});
    }
    return Response.json(result,{status:result.ok?200:400,headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    const timedOut=error?.name==='TimeoutError';
    return Response.json({ok:false,error:timedOut?'Server javobi kechikdi. Qayta urinib ko‘ring.':'Server bilan bog‘lanib bo‘lmadi.'},{
      status:504,headers:{'Cache-Control':'no-store'}
    });
  }
}
export const config={path:'/api/attendance'};
