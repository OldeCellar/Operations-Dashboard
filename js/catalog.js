(window.OCD_V=window.OCD_V||{})['catalog.js']='0.1.0';
/* Beer Catalog tab (read-only in stage 1). Reads beers[] from brewery_data.json via OCD. */
window.BeerCatalog=(()=>{
  let started=false,wired=false;
  const $=id=>document.getElementById(id);
  const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const CAT={'core brand':'Core Brands','seasonal':'Seasonal','filler':'Fillers'}, CAT_ORDER=['core brand','seasonal','filler'];
  const LANE={ipa:'Tank 01 · IPA',lager:'Tank 02 · Lager',flex:'Tank 03 · Flex'};
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const targets=b=>{const l=(b.targets&&b.targets.length)?b.targets:(b.target?[b.target]:[]);return l.map(t=>MON[t[0]-1]+' '+t[1]);};
  function wire(){
    if(wired) return; wired=true;
    ['cat-category','cat-lane','cat-search','cat-disabled'].forEach(id=>$(id).addEventListener(id==='cat-search'?'input':'change',render));
  }
  function render(){
    const d=OCD.get(), st=$('cat-status'), body=$('cat-body');
    if(!d||!Array.isArray(d.beers)){
      st.className='cat-status err';
      st.textContent='Could not load the beer catalog'+(OCD.status.error?': '+OCD.status.error:'.')+' (Check that the data file URL in js/data.js is reachable.)';
      body.innerHTML=''; return;
    }
    const q=$('cat-search').value.trim().toLowerCase(), fc=$('cat-category').value, fl=$('cat-lane').value, sd=$('cat-disabled').checked;
    const rows=d.beers.filter(b=>(sd||b.enabled!==false)&&(!fc||b.cat===fc)&&(!fl||b.lane===fl)&&(!q||(b.name+' '+b.style+' '+(b.note||'')).toLowerCase().includes(q)))
      .sort((a,b)=>CAT_ORDER.indexOf(a.cat)-CAT_ORDER.indexOf(b.cat)||(a.rotationOrder??99)-(b.rotationOrder??99)||a.name.localeCompare(b.name));
    st.className='cat-status';
    st.textContent=rows.length+' of '+d.beers.length+' beers · data saved '+(d.savedAt?new Date(d.savedAt).toLocaleString():'unknown')+' · scheduler '+esc(d.appVersion||'?');
    body.innerHTML=rows.map(b=>`<tr class="${b.enabled===false?'off':''}">
      <td class="nm">${esc(b.name)}</td><td>${esc(b.style)}</td>
      <td><span class="pill ${esc(b.cat.replace(' ','-'))}">${esc(CAT[b.cat]||b.cat)}</span></td>
      <td>${esc(LANE[b.lane]||b.lane)}</td>
      <td class="n">${b.t??'—'}</td><td class="n">${b.m??'—'}</td><td class="n">${b.total??'—'}</td>
      <td class="n">${b.pri??'—'}</td><td class="n">${b.rotationOrder??'—'}</td>
      <td>${esc(targets(b).join(', ')||'—')}</td>
      <td>${b.enabled===false?'Disabled':'Active'}</td>
      <td class="note">${esc(b.note||'')}</td></tr>`).join('')||'<tr><td colspan="12" class="empty">No beers match.</td></tr>';
  }
  async function load(){ await OCD.reload(); render(); }
  return{
    mount(){ if(started) return; started=true; wire(); OCD.ready.then(render); },
    reload(){ if(started) load(); }
  };
})();
