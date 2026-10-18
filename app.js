/* Tab router. Each tab = a <section id="view-NAME"> plus an optional module exposing mount()/reload(). */
const TABS=[
  {id:'ops',      label:'Operations & Cellar'},
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
