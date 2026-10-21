(window.OCD_V=window.OCD_V||{})['history.js']='0.1.0';
/* Brew History tab: the Scheduler's history table (status from the Brewfather cache, days on tap, per-beer averages) with log / edit / delete / status edits saved via OCD.save. */
window.BrewHistory=(()=>{
  let started=false,wired=false,modal=null,sort={col:'batch',dir:-1},rows=[];
  const $=id=>document.getElementById(id), E=()=>window.SchedulerEngine;
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const COLOR={'var(--blue2)':'#2c5aa0','var(--amber)':'#a05a0c','var(--gold2)':'#a05a0c','var(--hops)':'#2f7d4f','var(--muted)':'#8a7458','var(--green)':'#2f7d4f','var(green)':'#2f7d4f','#c47000':'#c47000'};
  const STATUSES=['BF Planning','Brewing','Fermenting','Conditioning','Completed','Serving','Archived','Kegerator'];
  const KEY={'BF Planning':'Planning'};
  const iso=d=>d?E().fmtISO(d):'';
  const DOT={bf:['●','Live from Brewfather (nightly sync)'],'bf-stored':['◑','From the last Brewfather import'],calc:['○','Estimated from dates, not in Brewfather yet']};
  const COLS=[['date','Date'],['tank','Tank'],['batch','Batch#'],['name','Beer'],['seq','Seq#'],['style','Style'],[null,'Cat'],['kegDate','Keg Date'],['dateTapped','Date Tapped'],['dateKicked','Date Kicked'],['daysOnTap','Days on Tap'],['avgDaysOnTap','Avg Days/Tap'],['status','Status']];

  function sortVal(r,c){
    switch(c){
      case'date':return r.h.date||'';case'tank':return r.h.tank||'';case'batch':return Number(r.h.batch)||0;case'name':return r.h.name||'';case'seq':return Number(r.h.seq)||0;
      case'style':return r.beer?r.beer.style:'';case'kegDate':return r.h.kegDate||'';case'dateTapped':return iso(r.tappedDate);case'dateKicked':return iso(r.kickedDate);
      case'daysOnTap':return r.daysOnTap==null?-1:r.daysOnTap;case'avgDaysOnTap':return r.avgDaysOnTap==null?-1:r.avgDaysOnTap;case'status':return r.statusLabel;
    } return '';
  }
  function needToken(){ if(OCD.gh.has()) return false; OCDSettings.open('To edit, paste your GitHub token and click Save & test.'); return true; }

  function render(){
    const d=OCD.get(), st=$('hist-status'), tb=$('hist-table');
    if(!d||!E()){ st.className='hist-status err'; st.textContent='Could not load history'+(OCD.status.error?': '+OCD.status.error:'.'); tb.innerHTML=''; return; }
    rows=E().historyRows(d);
    const cat=$('hist-cat').value, sf=$('hist-statusf').value, q=$('hist-search').value.trim().toLowerCase();
    let list=rows.filter(r=>(cat==='all'||(cat==='IPA'&&r.beer&&r.beer.type==='IPA')||(cat==='Lager'&&r.beer&&r.beer.type==='Lager')||(cat==='seasonal'&&r.beer&&r.beer.cat==='seasonal'))
      &&(sf==='all'||r.statusLabel===sf)
      &&(!q||(r.h.name+' '+r.h.batch+' '+(r.beer?r.beer.style:'')+' '+(r.h.tank||'')+' '+r.statusLabel).toLowerCase().includes(q)));
    list.sort((a,b)=>{let av=sortVal(a,sort.col),bv=sortVal(b,sort.col);return av<bv?-sort.dir:av>bv?sort.dir:0;});
    if(!st.dataset.flash){ st.className='hist-status'; st.textContent=list.length+' of '+rows.length+' batches · data saved '+(d.savedAt?new Date(d.savedAt).toLocaleString():'unknown')+(OCD.gh.has()?'':' · add your GitHub token in Settings to edit'); }
    const arrow=c=>sort.col!==c?'<span class="ar">⇅</span>':'<span class="ar on">'+(sort.dir===1?'↑':'↓')+'</span>';
    let h='<thead><tr>'+COLS.map(([c,l])=>c?`<th class="sortable" data-sort="${c}">${l}${arrow(c)}</th>`:`<th>${l}</th>`).join('')+'<th></th></tr></thead><tbody>';
    if(!list.length) h+='<tr><td colspan="14" class="empty">No results</td></tr>';
    list.forEach(r=>{
      const col=COLOR[r.statusColor]||'#8a7458', dot=DOT[r.source]||DOT.calc, M=E().fmtMDY;
      const tapped=r.tappedDate?`<span class="${r.tappedActual?'':'est'}" title="${r.tappedActual?'Actual, from the Brewfather Date Tapped field':'Estimated: no Date Tapped logged yet'}">${M(r.tappedDate)}</span>`:'—';
      h+=`<tr><td class="mono">${r.bd?E().fmtFull(r.bd):'—'}</td><td class="mono dim">${esc(r.h.tank||'—')}</td><td class="bn">#${esc(r.h.batch)}</td><td class="nm">${esc(r.h.name)}</td>
        <td class="mono dim">#${esc(r.h.seq||'—')}</td><td>${r.beer?esc(r.beer.style):''}</td><td>${r.beer?`<span class="pill ${esc(r.beer.cat.replace(' ','-'))}">${esc(r.beer.cat)}</span>`:''}</td>
        <td class="mono">${r.kd?E().fmtMDY(r.kd):'—'}</td><td class="mono">${tapped}</td><td class="mono">${r.kickedDate?M(r.kickedDate):'—'}</td>
        <td class="mono c">${r.daysOnTap!=null?r.daysOnTap+'d':'—'}</td><td class="mono c dim">${r.avgDaysOnTap!=null?r.avgDaysOnTap+'d':'—'}</td>
        <td><select class="stsel" data-status="${esc(r.h.batch)}" style="color:${col}">${STATUSES.map(s=>`<option ${s===r.statusLabel?'selected':''}>${s}</option>`).join('')}</select><span class="dot" title="${dot[1]}" style="color:${r.source==='calc'?'#8a7458':'#2f7d4f'}">${dot[0]}</span></td>
        <td class="nw"><button class="ib" data-edit="${esc(r.h.batch)}" title="Edit">✏</button><button class="ib x" data-del="${esc(r.h.batch)}" title="Delete">✕</button></td></tr>`;
    });
    tb.innerHTML=h+'</tbody>';
  }
  function flash(t,err){const st=$('hist-status');st.dataset.flash='1';st.className='hist-status'+(err?' err':'');st.textContent=t;setTimeout(()=>{delete st.dataset.flash;render();},5000);}
  const afterSave=()=>{ render(); if(window.ProductionSchedule&&ProductionSchedule.refresh) ProductionSchedule.refresh(); };

  // ---------- log / edit modal ----------
  function suggestSeq(name){ const s=(OCD.get().history||[]).filter(h=>h.name===name).map(h=>Number(h.seq)||0); return (s.length?Math.max(...s):0)+1; }
  function openEditor(batch){
    if(needToken()) return;
    if(modal) modal.remove();
    const d=OCD.get(), ex=batch==null?null:(d.history||[]).find(h=>String(h.batch)===String(batch));
    const names=[...new Set((d.beers||[]).filter(b=>b.enabled!==false||(ex&&b.name===ex.name)).map(b=>b.name))].sort();
    const nextBatch=Math.max(0,...(d.history||[]).map(h=>Number(h.batch)||0))+1;
    modal=document.createElement('div');modal.className='ocd-modal';
    modal.innerHTML=`<div class="ocd-box"><h3>${ex?'Edit brew':'Log brew'}</h3>
      <label>Beer<select id="hb-name">${names.map(n=>`<option>${esc(n)}</option>`).join('')}</select></label>
      <div class="row2"><label>Batch #<input id="hb-batch" type="number" min="1"></label><label>Seq #<input id="hb-seq" type="number" min="1"></label></div>
      <div class="row2"><label>Brew date<input id="hb-date" type="date"></label><label>Keg date<input id="hb-keg" type="date"></label></div>
      <label>Tank<select id="hb-tank"><option>Tank 01</option><option>Tank 02</option><option>Tank 03</option></select></label>
      <label>Notes<input id="hb-notes" type="text"></label>
      <p class="ocd-msg" id="hb-msg"></p>
      <div class="ocd-actions"><span style="flex:1"></span><button class="ocd-btn ghost" id="hb-cancel">Cancel</button><button class="ocd-btn" id="hb-save">${ex?'Update brew':'Log brew'}</button></div></div>`;
    document.body.appendChild(modal);
    const g=id=>modal.querySelector('#'+id), msg=(t,e)=>{g('hb-msg').textContent=t;g('hb-msg').className='ocd-msg'+(e?' err':'');};
    if(ex&&!names.includes(ex.name)) g('hb-name').insertAdjacentHTML('afterbegin',`<option>${esc(ex.name)}</option>`);
    g('hb-name').value=ex?ex.name:names[0]; g('hb-batch').value=ex?ex.batch:nextBatch; g('hb-seq').value=ex?(ex.seq||''):suggestSeq(g('hb-name').value);
    g('hb-date').value=ex?(ex.date||''):''; g('hb-keg').value=ex?(ex.kegDate||''):''; g('hb-tank').value=ex&&ex.tank?ex.tank:'Tank 01'; g('hb-notes').value=ex?(ex.notes||''):'';
    g('hb-name').onchange=()=>{ if(!ex) g('hb-seq').value=suggestSeq(g('hb-name').value); };
    modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();}); g('hb-cancel').onclick=()=>modal.remove();
    g('hb-save').onclick=async()=>{
      const name=g('hb-name').value, batchNo=parseInt(g('hb-batch').value), seq=parseInt(g('hb-seq').value)||1, date=g('hb-date').value;
      if(!name||!batchNo||!date){ msg('Beer, batch # and brew date are required.',true); return; }
      const fields={name,batch:batchNo,seq,date,kegDate:g('hb-keg').value,tank:g('hb-tank').value,notes:g('hb-notes').value};
      g('hb-save').disabled=true; msg('Saving to GitHub…');
      try{
        await OCD.save(o=>{
          o.history=o.history||[];
          if(ex){ const cur=o.history.find(h=>String(h.batch)===String(ex.batch)); if(!cur) throw new Error('Batch #'+ex.batch+' is no longer in the history.');
                  if(batchNo!==ex.batch&&o.history.some(h=>h.batch===batchNo)) throw new Error('Batch #'+batchNo+' already exists.'); Object.assign(cur,fields); }
          else { if(o.history.some(h=>h.batch===batchNo)) throw new Error('Batch #'+batchNo+' is already in the history.');
                 const b=(o.beers||[]).find(x=>x.name===name); o.history.push(Object.assign({},fields,{beerId:b?b.id:undefined,dateTapped:'',dateKicked:''})); }
          o.history.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
        },(ex?'Edit brew #':'Log brew #')+batchNo+': '+name+' (dashboard)');
        modal.remove(); afterSave(); flash((ex?'Updated':'Logged')+' batch #'+batchNo+'.');
      }catch(e){ msg(e.message,true); g('hb-save').disabled=false; }
    };
  }
  async function removeBatch(batch){
    if(needToken()) return;
    if(!confirm('Delete batch #'+batch+' from history? (It can be restored from the GitHub history.)')) return;
    try{ await OCD.save(o=>{o.history=(o.history||[]).filter(h=>String(h.batch)!==String(batch));},'Delete brew #'+batch+' (dashboard)'); afterSave(); flash('Deleted batch #'+batch+'.'); }
    catch(e){ flash(e.message,true); }
  }
  async function setStatus(batch,label,sel){
    if(needToken()){ render(); return; }
    const key=KEY[label]||label;
    try{ await OCD.save(o=>{const h=(o.history||[]).find(x=>String(x.batch)===String(batch)); if(!h) throw new Error('Batch #'+batch+' not found.'); h.bfStatus=key; if(o.bfBatchCache&&o.bfBatchCache[batch]) delete o.bfBatchCache[batch];},'Set status of brew #'+batch+' to '+label+' (dashboard)'); afterSave(); flash('Batch #'+batch+' set to '+label+'.'); }
    catch(e){ flash(e.message,true); render(); }
  }
  function wire(){
    if(wired) return; wired=true;
    ['hist-cat','hist-statusf'].forEach(id=>$(id).addEventListener('change',render)); $('hist-search').addEventListener('input',render);
    $('hist-add').onclick=()=>openEditor(null);
    $('hist-table').addEventListener('click',e=>{
      const s=e.target.closest('[data-sort]'); if(s){const c=s.dataset.sort; if(sort.col===c) sort.dir*=-1; else{sort.col=c;sort.dir=1;} render(); return;}
      const ed=e.target.closest('[data-edit]'); if(ed) openEditor(ed.dataset.edit);
      const dl=e.target.closest('[data-del]'); if(dl) removeBatch(dl.dataset.del);
    });
    $('hist-table').addEventListener('change',e=>{const s=e.target.closest('[data-status]'); if(s) setStatus(s.dataset.status,s.value,s);});
  }
  return{ mount(){ if(started)return; started=true; wire(); OCD.ready.then(render); }, reload(){ if(started) OCD.reload().then(render); }, refresh(){ if(started) render(); } };
})();
