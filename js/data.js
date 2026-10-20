(window.OCD_V=window.OCD_V||{})['data.js']='0.1.1';
/* Shared data loader. ONE setting decides where brewery_data.json lives.
   Stage 2 (now): this repo's own copy, kept fresh by the nightly bf_sync.yml Action and by the Scheduler/dashboard saves. */
window.OCD=window.OCD||{};
OCD.config={dataUrl:'https://raw.githubusercontent.com/OldeCellar/Operations-Dashboard/main/brewery_data.json'};
OCD.status={ok:false,error:null,loadedAt:null};
OCD._data=null;
OCD.load=async function(){
  try{
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
