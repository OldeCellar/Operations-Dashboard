(window.OCD_V=window.OCD_V||{})['data.js']='0.2.0';
/* Shared data loader. ONE setting decides where brewery_data.json lives.
   Stage 2 (now): this repo's own copy, kept fresh by the nightly bf_sync.yml Action and by the Scheduler/dashboard saves. */
window.OCD=window.OCD||{};
OCD.config={dataFile:'brewery_data.json',dataUrl:'https://raw.githubusercontent.com/OldeCellar/Operations-Dashboard/main/brewery_data.json'};
OCD.status={ok:false,error:null,loadedAt:null};
OCD._data=null;
/* ---- GitHub access (token lives only in this browser's localStorage; never in the repo) ---- */
OCD.gh={
  cfg(){let c={};try{c=JSON.parse(localStorage.getItem('ocd_gh')||'{}')}catch(e){}return Object.assign({repo:'OldeCellar/Operations-Dashboard',branch:'main',token:''},c);},
  setCfg(c){localStorage.setItem('ocd_gh',JSON.stringify(c));},
  has(){return !!OCD.gh.cfg().token;},
  headers(raw){return{Authorization:'Bearer '+OCD.gh.cfg().token,Accept:raw?'application/vnd.github.raw+json':'application/vnd.github+json'};},
  url(){return 'https://api.github.com/repos/'+OCD.gh.cfg().repo+'/contents/'+OCD.config.dataFile;},
  async fetchRemote(){   // authenticated read: no CDN lag, returns the blob SHA needed for safe writes
    const ref='?ref='+encodeURIComponent(OCD.gh.cfg().branch)+'&t='+Date.now();
    const r=await fetch(OCD.gh.url()+ref,{headers:OCD.gh.headers()});
    if(!r.ok) throw new Error('GitHub read failed: HTTP '+r.status);
    const j=await r.json(); let text;
    if(j.content&&j.encoding==='base64'){const bin=atob(j.content.replace(/\n/g,''));text=new TextDecoder().decode(Uint8Array.from(bin,c=>c.charCodeAt(0)));}
    else{const rr=await fetch(OCD.gh.url()+ref,{headers:OCD.gh.headers(true)});if(!rr.ok)throw new Error('GitHub read failed: HTTP '+rr.status);text=await rr.text();}
    return{data:JSON.parse(text),sha:j.sha};
  },
  async test(){
    const c=OCD.gh.cfg(); const r=await fetch('https://api.github.com/repos/'+c.repo,{headers:OCD.gh.headers()});
    if(!r.ok) throw new Error('Cannot open repo '+c.repo+' (HTTP '+r.status+'). Check the repo name and that the token has access to it.');
    const j=await r.json(); const rem=await OCD.gh.fetchRemote();
    return{repo:c.repo,canPush:!j.permissions||j.permissions.push!==false,savedAt:rem.data.savedAt};
  }
};
/* Conflict-safe save: re-reads the LATEST file, applies your change to it, writes back. Nightly sync changes are never overwritten. */
OCD.save=async function(mutator,message){
  if(!OCD.gh.has()) throw new Error('No GitHub token saved yet. Open Settings first.');
  const c=OCD.gh.cfg(); let lastErr='';
  for(let attempt=1;attempt<=3;attempt++){
    const remote=await OCD.gh.fetchRemote(), obj=remote.data;
    mutator(obj); obj.savedAt=new Date().toISOString();
    const bytes=new TextEncoder().encode(JSON.stringify(obj,null,2)); let bin='';
    for(let i=0;i<bytes.length;i+=0x8000) bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));
    const r=await fetch(OCD.gh.url(),{method:'PUT',headers:OCD.gh.headers(),body:JSON.stringify({message:message||'Dashboard save',content:btoa(bin),branch:c.branch,sha:remote.sha})});
    if(r.ok){OCD._data=obj;OCD.status={ok:true,error:null,loadedAt:new Date()};return obj;}
    const e=await r.json().catch(()=>({}));lastErr=e.message||('HTTP '+r.status);
    if((r.status===409||r.status===422)&&attempt<3){await new Promise(s=>setTimeout(s,800));continue;}
    break;
  }
  throw new Error('Save failed: '+lastErr);
};

OCD.load=async function(){
  try{
    if(OCD.gh.has()){ try{ OCD._data=(await OCD.gh.fetchRemote()).data; OCD.status={ok:true,error:null,loadedAt:new Date()}; return OCD._data; }catch(e){ console.warn('Authenticated read failed, using public copy',e); } }
    const res=await fetch(OCD.config.dataUrl,{cache:'no-cache'});
    if(!res.ok) throw new Error('HTTP '+res.status+' loading '+OCD.config.dataUrl);
    OCD._data=await res.json();
    OCD.status={ok:true,error:null,loadedAt:new Date()};
  }catch(e){
    OCD.status={ok:false,error:String(e&&e.message||e),loadedAt:null};
    console.warn('OCD data load failed',e);
  }
  return OCD._data;
};
OCD.ready=OCD.load();                       // resolves (never rejects) once the first load attempt finishes
OCD.get=()=>OCD._data;
OCD.reload=()=>{OCD.ready=OCD.load();return OCD.ready;};
/* Beer-name -> {primary, categories} in the Request Log's vocabulary, built from the catalog (enabled beers only). */
OCD.requestLogCatalog=function(){
  const d=OCD._data; if(!d||!Array.isArray(d.beers)) return null;
  const L={'core brand':'Core Brands','filler':'Fillers','seasonal':'Seasonal'}, out={};
  d.beers.filter(b=>b.enabled!==false&&L[b.cat]).forEach(b=>{
    const o=out[b.name]||(out[b.name]={primary:null,categories:[]});
    if(!o.categories.includes(L[b.cat])) o.categories.push(L[b.cat]);
  });
  Object.values(out).forEach(o=>o.primary=o.categories.includes('Seasonal')?'Seasonal':o.categories[0]);
  return out;
};
