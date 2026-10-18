/* Tab router. Each tab = a <section id="view-NAME"> plus an optional module exposing mount()/reload(). */
const TABS=[
  {id:'ops',      label:'Operations & Cellar', module:()=>window.OnTap},
  {id:'schedule', label:'Production Schedule'},
  {id:'requests', label:'Demand & Request Log', module:()=>window.RequestLog},
  {id:'catalog',  label:'Beer Catalog'}
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
  const EXPECTED={"index.html": "0.5.0", "app.js": "0.5.0", "on-tap.js": "0.5.0", "request-log.js": "0.1.0", "theme.css": "0.3.0", "request-log.css": "0.1.0", "on-tap.css": "0.3.0"};
  const cs=(id,v)=>{const e=document.getElementById(id)||document.documentElement;return (getComputedStyle(e).getPropertyValue(v)||'').replace(/["'\s]/g,'')||null;};
  const found={
    'index.html':document.querySelector('meta[name=ocd-version]')?.content||null,
    'app.js':'0.5.0',
    'theme.css':cs(null,'--v-theme'),
    'request-log.css':cs('rl','--v-request-log-css'),
    'on-tap.css':cs('ot','--v-on-tap-css'),
    'request-log.js':(window.OCD_V||{})['request-log.js']||null,
    'on-tap.js':(window.OCD_V||{})['on-tap.js']||null
  };
  document.getElementById('ver').innerHTML='Files: '+Object.keys(EXPECTED).map(k=>{
    const f=found[k],ok=f===EXPECTED[k];
    return ok?`${k} ${f}`:`<span class="bad">${k} ${f||'MISSING'} (expected ${EXPECTED[k]})</span>`;
  }).join(' · ');
})();
