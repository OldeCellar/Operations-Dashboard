window.OCD_V=window.OCD_V||{};OCD_V['app.js']='0.19.0';
/* Tab router. Each tab = a <section id="view-NAME"> plus an optional module exposing mount()/reload(). */
const TABS=[
  {id:'ops',      label:'Operations & Cellar', module:()=>window.OnTap},
  {id:'schedule', label:'Production Schedule', module:()=>window.ProductionSchedule},
  {id:'history',  label:'Brew History', module:()=>window.BrewHistory},
  {id:'requests', label:'Demand & Request Log', module:()=>window.RequestLog},
  {id:'purchasing', label:'Purchasing', module:()=>window.Purchasing},
  {id:'catalog',  label:'Beer Catalog', module:()=>window.BeerCatalog},
  {id:'units',    label:'Units', module:()=>window.Units}
];
const nav=document.getElementById('tabs');
nav.innerHTML=TABS.map(t=>`<button data-t="${t.id}">${t.label}</button>`).join('');
function show(id){
  TABS.forEach(t=>document.getElementById('view-'+t.id).hidden=t.id!==id);
  nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.t===id));
  const m=TABS.find(t=>t.id===id).module?.(); if(m) m.mount();
  history.replaceState(null,'','#'+id);
}
nav.onclick=e=>{const b=e.target.closest('button'); if(b) show(b.dataset.t)};
document.getElementById('refresh-all').onclick=()=>TABS.forEach(t=>t.module?.()?.reload?.());
const h=location.hash.slice(1);
show(TABS.some(t=>t.id===h)?h:'requests');

/* ---- release number and version check: RELEASE and EXPECTED now live in js/versions.js ---- */
const VER=window.OCD_VERSIONS||null;
const RELEASE=VER?VER.release:'unknown';   // do not edit here: change release in js/versions.js
const relEl=document.getElementById('rel'); if(relEl) relEl.textContent='v'+RELEASE;
/* shows every file's version and flags any that don't match what versions.js expects (this includes app.js itself) */
(function(){
  const ft=document.getElementById('ver');
  if(!VER){ft.innerHTML='<span class="bad">versions.js MISSING: file versions cannot be checked</span>';return;}
  const EXPECTED=VER.expected, V=window.OCD_V||{};
  const cs=(id,v)=>{const e=document.getElementById(id)||document.documentElement;return (getComputedStyle(e).getPropertyValue(v)||'').replace(/["'\s]/g,'')||null;};
  const found={
    'index.html':document.querySelector('meta[name=ocd-version]')?.content||null,
    'theme.css':cs(null,'--v-theme'),
    'request-log.css':cs('rl','--v-request-log-css'),
    'on-tap.css':cs('ot','--v-on-tap-css'),
    'purchasing.css':cs('pur','--v-purchasing-css'),
    'history.css':cs('hist','--v-history-css'),
    'catalog.css':cs('cat','--v-catalog-css'),
    'schedule.css':cs('sch','--v-schedule-css')
  };
  Object.keys(EXPECTED).forEach(k=>{if(/\.js$/.test(k)) found[k]=V[k]||null;});   // every .js file reports itself on line 1 via OCD_V
  ft.innerHTML='Release '+RELEASE+' · Files: '+Object.keys(EXPECTED).map(k=>{
    const f=found[k],ok=f===EXPECTED[k];
    return ok?`${k} ${f}`:`<span class="bad">${k} ${f||'MISSING'} (expected ${EXPECTED[k]})</span>`;
  }).join(' · ');
})();
