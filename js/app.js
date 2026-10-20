/* Tab router. Each tab = a <section id="view-NAME"> plus an optional module exposing mount()/reload(). */
const TABS=[
  {id:'ops',      label:'Operations & Cellar', module:()=>window.OnTap},
  {id:'schedule', label:'Production Schedule', module:()=>window.ProductionSchedule},
  {id:'requests', label:'Demand & Request Log', module:()=>window.RequestLog},
  {id:'catalog',  label:'Beer Catalog', module:()=>window.BeerCatalog}
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

/* ---- version check: shows every file's version and flags any that don't match what this app.js expects ---- */
(function(){
  const EXPECTED={"index.html": "0.8.0", "app.js": "0.8.0", "on-tap.js": "0.5.0", "request-log.js": "0.2.0", "theme.css": "0.4.0", "request-log.css": "0.1.0", "on-tap.css": "0.3.0", "data.js": "0.2.0", "catalog.js": "0.2.0", "catalog.css": "0.2.0", "scheduler-engine.js": "0.1.0", "schedule.js": "0.2.0", "schedule.css": "0.1.0", "settings.js": "0.1.0"};
  const cs=(id,v)=>{const e=document.getElementById(id)||document.documentElement;return (getComputedStyle(e).getPropertyValue(v)||'').replace(/["'\s]/g,'')||null;};
  const found={
    'index.html':document.querySelector('meta[name=ocd-version]')?.content||null,
    'app.js':'0.8.0',
    'theme.css':cs(null,'--v-theme'),
    'request-log.css':cs('rl','--v-request-log-css'),
    'on-tap.css':cs('ot','--v-on-tap-css'),
    'request-log.js':(window.OCD_V||{})['request-log.js']||null,
    'on-tap.js':(window.OCD_V||{})['on-tap.js']||null,
    'data.js':(window.OCD_V||{})['data.js']||null,
    'settings.js':(window.OCD_V||{})['settings.js']||null,
    'catalog.js':(window.OCD_V||{})['catalog.js']||null,
    'catalog.css':cs('cat','--v-catalog-css'),
    'scheduler-engine.js':(window.OCD_V||{})['scheduler-engine.js']||null,
    'schedule.js':(window.OCD_V||{})['schedule.js']||null,
    'schedule.css':cs('sch','--v-schedule-css')
  };
  document.getElementById('ver').innerHTML='Files: '+Object.keys(EXPECTED).map(k=>{
    const f=found[k],ok=f===EXPECTED[k];
    return ok?`${k} ${f}`:`<span class="bad">${k} ${f||'MISSING'} (expected ${EXPECTED[k]})</span>`;
  }).join(' · ');
})();
