(window.OCD_V=window.OCD_V||{})['catalog.js']='0.2.0';
/* Beer Catalog tab: view + edit. Edits go through OCD.save (re-reads the latest brewery_data.json, applies the change, commits). */
window.BeerCatalog=(()=>{
  let started=false,wired=false,modal=null;
  const $=id=>document.getElementById(id);
  const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const CAT={'core brand':'Core Brands','seasonal':'Seasonal','filler':'Fillers'}, CAT_ORDER=['core brand','seasonal','filler'];
  const LANE={ipa:'Tank 01 · IPA',lager:'Tank 02 · Lager',flex:'Tank 03 · Flex'};
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const targets=b=>{const l=(b.targets&&b.targets.length)?b.targets:(b.target?[b.target]:[]);return l.map(t=>MON[t[0]-1]+' '+t[1]);};
  const targetsText=b=>((b.targets&&b.targets.length)?b.targets:(b.target?[b.target]:[])).map(t=>t[0]+'/'+t[1]).join(', ');

  function wire(){
    if(wired) return; wired=true;
    ['cat-category','cat-lane','cat-search','cat-disabled'].forEach(id=>$(id).addEventListener(id==='cat-search'?'input':'change',render));
    $('cat-add').onclick=()=>openEditor(null);
    $('cat-body').addEventListener('click',e=>{const b=e.target.closest('[data-edit]');if(b)openEditor(Number(b.dataset.edit));});
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
    if(!st.dataset.flash){ st.className='cat-status';
      st.textContent=rows.length+' of '+d.beers.length+' beers · data saved '+(d.savedAt?new Date(d.savedAt).toLocaleString():'unknown')+' · scheduler '+esc(d.appVersion||'?')+(OCD.gh.has()?'':' · add your GitHub token in Settings to edit'); }
    body.innerHTML=rows.map(b=>`<tr class="${b.enabled===false?'off':''}">
      <td class="nm">${esc(b.name)}</td><td>${esc(b.style)}</td>
      <td><span class="pill ${esc(b.cat.replace(' ','-'))}">${esc(CAT[b.cat]||b.cat)}</span></td>
      <td>${esc(LANE[b.lane]||b.lane)}</td>
      <td class="n">${b.t??'—'}</td><td class="n">${b.m??'—'}</td><td class="n">${b.total??'—'}</td>
      <td class="n">${b.pri??'—'}</td><td class="n">${b.rotationOrder??'—'}</td>
      <td>${esc(targets(b).join(', ')||'—')}</td>
      <td>${b.enabled===false?'Disabled':'Active'}</td>
      <td class="note">${esc(b.note||'')}</td>
      <td><button class="editbtn" data-edit="${b.id}">Edit</button></td></tr>`).join('')||'<tr><td colspan="13" class="empty">No beers match.</td></tr>';
  }
  function flash(text,err){const st=$('cat-status');st.dataset.flash='1';st.className='cat-status'+(err?' err':'');st.textContent=text;setTimeout(()=>{delete st.dataset.flash;render();},5000);}

  // ---------- editor ----------
  function build(){
    modal=document.createElement('div');modal.className='ocd-modal';modal.hidden=true;
    const styles=[...new Set((OCD.get()?.beers||[]).map(b=>b.type||b.style).filter(Boolean))].sort();
    modal.innerHTML=`<div class="ocd-box"><h3 id="be-title">Edit beer</h3>
      <label>Name<input id="be-name" type="text"></label>
      <div class="row2"><label>Style<input id="be-style" type="text" list="be-styles"><datalist id="be-styles">${styles.map(s=>`<option value="${esc(s)}">`).join('')}</datalist></label>
        <label>Category<select id="be-cat"><option value="core brand">Core brand</option><option value="seasonal">Seasonal</option><option value="filler">Filler</option></select></label></div>
      <div class="row2"><label>Lane (tank)<select id="be-lane"><option value="ipa">Tank 01 · IPA</option><option value="lager">Tank 02 · Lager</option><option value="flex">Tank 03 · Flex</option></select></label>
        <label>Priority<input id="be-pri" type="number" min="1"></label></div>
      <div class="row2"><label>Ferment days<input id="be-t" type="number" min="1"></label><label>Condition days<input id="be-m" type="number" min="0"></label></div>
      <div class="row2"><label>Rotation order<input id="be-rot" type="number" min="1"></label><label>Seq start<input id="be-seq" type="number" min="1"></label></div>
      <label>Serve targets (month/day, comma separated, e.g. 6/1, 7/1)<input id="be-targets" type="text"></label>
      <label>Notes<input id="be-note" type="text"></label>
      <label style="display:flex;gap:8px;align-items:center"><input id="be-enabled" type="checkbox"> Active (include in the schedule)</label>
      <p class="ocd-msg" id="be-msg"></p>
      <div class="ocd-actions"><button class="ocd-btn danger" id="be-delete">Delete</button><span style="flex:1"></span><button class="ocd-btn ghost" id="be-cancel">Cancel</button><button class="ocd-btn" id="be-save">Save</button></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{if(e.target===modal)modal.hidden=true;});
    modal.querySelector('#be-cancel').onclick=()=>modal.hidden=true;
  }
  const g=id=>modal.querySelector('#'+id), msg=(t,err)=>{g('be-msg').textContent=t;g('be-msg').className='ocd-msg'+(err?' err':'');};
  function parseTargets(txt){
    const out=[]; for(const part of txt.split(',').map(s=>s.trim()).filter(Boolean)){
      const m=part.match(/^(\d{1,2})\s*[\/\-]\s*(\d{1,2})$/); if(!m||+m[1]<1||+m[1]>12||+m[2]<1||+m[2]>31) throw new Error('Serve targets must look like 6/1, 7/1 (month/day). Problem: "'+part+'"');
      out.push([+m[1],+m[2]]);
    } return out;
  }
  function openEditor(id){
    if(!OCD.gh.has()){ OCDSettings.open('To edit, paste your GitHub token and click Save & test.'); return; }
    if(modal) modal.remove(); build();
    const b=id==null?null:(OCD.get().beers||[]).find(x=>x.id===id);
    g('be-title').textContent=b?'Edit beer':'Add beer';
    g('be-name').value=b?b.name:''; g('be-style').value=b?(b.type||b.style||''):''; g('be-cat').value=b?b.cat:'core brand'; g('be-lane').value=b?b.lane:'flex';
    g('be-pri').value=b?b.pri??'':3; g('be-t').value=b?b.t??'':21; g('be-m').value=b?b.m??'':7; g('be-rot').value=b&&b.rotationOrder!=null?b.rotationOrder:''; g('be-seq').value=b&&b.seqStart!=null?b.seqStart:'';
    g('be-targets').value=b?targetsText(b):''; g('be-note').value=b?(b.note||''):''; g('be-enabled').checked=b?b.enabled!==false:true;
    g('be-delete').style.display=b?'':'none';
    g('be-save').onclick=()=>save(b);
    g('be-delete').onclick=()=>remove(b);
    modal.hidden=false;
  }
  async function save(existing){
    try{
      const name=g('be-name').value.trim(); if(!name) throw new Error('Beer name is required.');
      const t=parseInt(g('be-t').value)||21, m=parseInt(g('be-m').value)||7, tg=parseTargets(g('be-targets').value);
      const rot=g('be-rot').value.trim(), seq=g('be-seq').value.trim();
      const form={name,style:g('be-style').value.trim(),type:g('be-style').value.trim(),cat:g('be-cat').value,lane:g('be-lane').value,pri:parseInt(g('be-pri').value)||3,t,m,total:t+m,
        target:tg.length?tg[0]:null,targets:tg.length?tg:null,note:g('be-note').value,enabled:g('be-enabled').checked};
      msg('Saving to GitHub…'); g('be-save').disabled=true;
      await OCD.save(obj=>{
        obj.beers=obj.beers||[];
        const cur=existing?obj.beers.find(x=>x.id===existing.id):null;
        // same rule as the Scheduler: leaving rotation / seq blank keeps the existing value
        const rotV=rot===''?(cur?cur.rotationOrder:null):(parseInt(rot)||null);
        const seqV=seq===''?(cur&&cur.seqStart!=null?cur.seqStart:null):((parseInt(seq,10)>=1)?parseInt(seq,10):(cur&&cur.seqStart!=null?cur.seqStart:null));
        if(cur) Object.assign(cur,form,{rotationOrder:rotV,seqStart:seqV});
        else obj.beers.push(Object.assign({},form,{rotationOrder:rotV,seqStart:seqV,id:Math.max(0,...obj.beers.map(x=>x.id||0))+1}));
      },(existing?'Edit beer: ':'Add beer: ')+name+' (dashboard)');
      modal.hidden=true; render(); flash('Saved "'+name+'" to GitHub.');
      if(window.ProductionSchedule&&ProductionSchedule.refresh) ProductionSchedule.refresh();
    }catch(e){ msg(e.message,true); }
    finally{ const s=modal&&modal.querySelector('#be-save'); if(s) s.disabled=false; }
  }
  async function remove(b){
    if(!b||!confirm('Delete "'+b.name+'" ('+(CAT[b.cat]||b.cat)+' / '+(LANE[b.lane]||b.lane)+') from the Beer Catalog? This cannot be undone from the dashboard (it can be reverted in GitHub history).')) return;
    try{ msg('Deleting…'); await OCD.save(obj=>{obj.beers=(obj.beers||[]).filter(x=>x.id!==b.id);},'Delete beer: '+b.name+' (dashboard)');
      modal.hidden=true; render(); flash('Deleted "'+b.name+'".'); if(window.ProductionSchedule&&ProductionSchedule.refresh) ProductionSchedule.refresh();
    }catch(e){ msg(e.message,true); }
  }
  async function load(){ await OCD.reload(); render(); }
  return{ mount(){ if(started) return; started=true; wire(); OCD.ready.then(render); }, reload(){ if(started) load(); } };
})();
