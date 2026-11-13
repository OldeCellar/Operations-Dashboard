(window.OCD_V=window.OCD_V||{})['purchasing.js']='0.7.0';
/* Purchasing tab (private bookkeeping repo): Catalog = items (tied to Brewfather inventory) with their vendor offers (vendor, SKU, link, pack size),
   plus a match review that links the offers imported from your workbook to Brewfather items. Later: Purchases, Order List, Costs. */
window.Purchasing=(()=>{
  let started=false,wired=false,C=null,S=null,sub='catalog',rtab='auto',card=0,expanded=new Set(),filt={q:'',type:''},addFor=null,editOff=null,addItemOpen=false,newOfferFor=null,oth={q:'',cat:''};
  const PKEY='ocd_books_pending';
  let pend={}; try{pend=JSON.parse(localStorage.getItem(PKEY)||'{}')}catch(e){}
  const $=id=>document.getElementById(id);
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const rawInv=()=>((OCD.get()||{}).packaging||{}).inventory||[];
  let invVer=0, gMemo=null, gKey='';
  function grp(){ const k=rawInv().length+'|'+invVer+'|'+(C?C.items.map(i=>(i.bfIgnore||[]).join(',')).join(';'):''); if(gKey!==k||!gMemo){ gMemo=DemandCalc.groupInventory(rawInv(),C?C.items:[]); gKey=k; } return gMemo; }
  const inv=()=>grp().virtual;
  const gid=id=>grp().groupOf.get(id)||id;
  const bfById=()=>{ const m=new Map(); grp().virtual.forEach(v=>v.members.forEach(x=>m.set(x.bf_id,v))); return m; };
  const money=v=>v==null?'—':'$'+Number(v).toFixed(2);
  const savePend=()=>{try{localStorage.setItem(PKEY,JSON.stringify(pend))}catch(e){}};
  const nPend=()=>Object.keys(pend).length;
  function metric(pack,unit){ const u=S&&S.units&&S.units[unit]; if(!pack||!u) return null; return {qty:pack*u.factor,unit:u.to}; }
  const fmtQty=m=>m?(m.qty>=100?m.qty.toFixed(0):m.qty>=10?m.qty.toFixed(1):m.qty.toFixed(2))+' '+m.unit:'—';
  function msg(t,err){const m=$('pur-msg'); if(m){m.textContent=t||'';m.className='pur-msg'+(err?' err':'');}}

  async function load(){
    msg('Loading catalog from the private repo…');
    try{
      const [c,s]=await Promise.all([OCD.books.read('catalog.json'),OCD.books.read('settings.json')]);
      C=c.data; S=s.data; C.items=C.items||[]; C.offers=C.offers||[]; msg(''); render();
    }catch(e){ C=null; $('pur-body').innerHTML=''; msg(e.message,true); }
  }
  const unmatched=()=>C.offers.filter(o=>!o.itemId&&o.matchStatus!=='skipped'&&o.matchStatus!=='historyOnly');
  const queue=k=>unmatched().filter(o=>!pend[o.id]&&(k==='auto'?o.matchStatus==='auto':k==='review'?o.matchStatus==='review':k==='weak'?(o.matchStatus==='weak'||o.matchStatus==='none'):(!o.matchStatus&&o.matchStatus!=='skipped')));

  function render(){
    if(!C){return;}
    const unm=unmatched().length;
    $('pur-body').innerHTML=
      `<div class="pur-bar"><button class="pur-sub ${sub==='catalog'?'on':''}" data-sub="catalog">Catalog</button>
        <button class="pur-sub ${sub==='review'?'on':''}" data-sub="review">Match review${unm?` <span class="pur-count">${unm}</span>`:''}</button>
        <button class="pur-sub ${sub==='demand'?'on':''}" data-sub="demand">Demand</button><button class="pur-sub ${sub==='order'?'on':''}" data-sub="order">Order List</button>
        <button class="pur-sub off" disabled title="coming next">Purchases</button><button class="pur-sub off" disabled title="coming next">Costs</button></div>`+
      (nPend()?`<div class="pur-pend"><b>${nPend()}</b> match decision${nPend()===1?'':'s'} waiting. <button class="ocd-btn" id="pur-save">Save to GitHub</button> <button class="ocd-btn ghost" id="pur-discard">Discard</button></div>`:'')+
      (sub==='catalog'?catalogHtml():sub==='review'?reviewHtml():sub==='demand'?demandHtml():orderHtml());
  }



  const nameOf=it=>{ const v=it.bfId&&bfById().get(it.bfId); return v?(v.label||v.name):it.name; };
  const latestBatchOf=name=>{ const h=((OCD.get()||{}).history||[]).filter(x=>(x.name||'').toLowerCase()===String(name||'').toLowerCase()); if(!h.length) return null; return h.reduce((a,b)=>(Number(b.batch)||0)>(Number(a.batch)||0)?b:a).batch; };
  async function refreshInventory(){
    const u=localStorage.getItem('ontap_bf_userid'), k=localStorage.getItem('ontap_bf_apikey');
    if(!u||!k){ msg('Save your Brewfather User ID and API key first (Operations & Cellar, then Settings).',true); return; }
    msg('Reading your inventory from Brewfather…');
    try{ const auth='Basic '+btoa(u+':'+k), list=rawInv(), byId=new Map(list.map(i=>[i.bf_id,i])); let upd=0, fresh=0, total=0;
      for(const ep of ['fermentables','hops','yeasts','miscs']){ let start=null;
        for(let pg=0;pg<40;pg++){ const url='https://api.brewfather.app/v2/inventory/'+ep+'?limit=50'+(start?'&start_after='+encodeURIComponent(start):'');
          const r=await fetch(url,{headers:{Authorization:auth}}); if(!r.ok) throw new Error('Brewfather returned HTTP '+r.status);
          const a=await r.json(); if(!Array.isArray(a)||!a.length) break;
          a.forEach(x=>{ total++; const i=byId.get(x._id); if(i){ i.onHand=x.inventory; i.name=x.name||i.name; if(x.unit) i.unit=x.unit; if(x.supplier!==undefined) i.bf_supplier=x.supplier; upd++; } else fresh++; });
          if(a.length<50) break; start=a[a.length-1]._id; } }
      invVer++; msg('Inventory refreshed from Brewfather: '+upd+' items updated'+(fresh?', '+fresh+' new items will appear after the next nightly sync':'')+'.'); render();
    }catch(e){ msg(e.message,true); }
  }

  // ---- recipe usage, minimum stock (Brewfather unit) and what that means in vendor packs ----
  let usageMemo=null, usageKey='';
  function usage(){ if(!RC||!window.DemandCalc) return {}; const k=RC.fetchedAt+'|'+inv().length; if(usageKey!==k){ usageMemo=DemandCalc.recipeUsage(RC.byName,inv()); usageKey=k; } return usageMemo; }
  const itemUnit=(it,by)=>((it.bfId&&by.get(it.bfId))||{}).unit||it.unit||'g';
  const fq=n=>n==null?'—':(Math.abs(n)>=100?n.toFixed(0):Math.abs(n)>=10?n.toFixed(1):n.toFixed(2));
  const prefOffer=(it,offs)=>offs.find(o=>o.id===it.preferredOfferId)||offs.slice().sort((a,b)=>(b.lastDate||'').localeCompare(a.lastDate||''))[0];
  const unitOpts=sel=>Object.keys(S.units||{}).map(u=>`<option ${u===sel?'selected':''}>${esc(u)}</option>`).join('');
  function minCell(it,offs,unit){
    const pref=prefOffer(it,offs); let eq='';
    if(it.minStock!=null&&pref){ const bits=[], vu=pref.unit&&S.units&&S.units[pref.unit]?pref.unit:null;
      if(vu){ const v=DemandCalc.toVendorUnit(it.minStock,unit,vu,S.units); if(v!=null) bits.push('= '+fq(v)+' '+vu); }
      const pq=DemandCalc.packQuantity(pref,unit,S.units,it.minStock); if(pq) bits.push('order '+pq.packs+' × '+pref.packSize+' '+pref.unit);
      eq=`<div class="eq">${bits.join(' · ')}</div>`; }
    return `<td><div class="msbox"><input class="minstock" data-ms="${esc(it.id)}" type="number" step="any" min="0" value="${it.minStock==null?'':esc(String(it.minStock))}" placeholder="—"><span class="pur-dim">${esc(unit)}</span></div>${eq}</td>`;
  }
  function maxCell(it,offs,unit,u){
    if(!RC) return '<td><button class="lnk" data-reloadrec="1">load recipes</button></td>'; if(!u) return '<td class="pur-dim">not in any recipe</td>';
    const pref=prefOffer(it,offs), vu=pref&&pref.unit&&S.units&&S.units[pref.unit]?pref.unit:null, alt=vu?DemandCalc.toVendorUnit(u.max,unit,vu,S.units):null, bn=latestBatchOf(u.maxRecipe);
    return `<td>${fq(u.max)} ${esc(unit)}${alt!=null?` <span class="pur-dim">(${fq(alt)} ${esc(vu)})</span>`:''}<div class="eq">${esc(u.maxRecipe||'')}${bn?' · latest batch #'+esc(String(bn)):''}</div></td>`;
  }
  const offerFormRow=(iid,select,cols)=>`<tr class="addrow"><td></td><td><input class="a-vendor" placeholder="Vendor"></td><td><input class="a-sku" placeholder="SKU"></td><td><input class="a-link" placeholder="https://…"></td>
    <td><input class="a-pack" type="number" step="any" placeholder="size" style="width:64px"> <select class="a-unit">${unitOpts()}</select></td><td></td>
    <td><input class="a-price" type="number" step="0.01" placeholder="price" style="width:78px"></td><td></td><td></td><td><button class="ocd-btn" data-addoff="${esc(iid)}" data-select="${select?1:0}">Add offer</button></td></tr>`;

  // ---------------- Catalog ----------------
  function catalogHtml(){
    const by=bfById(), q=filt.q.toLowerCase();
    const items=C.items.filter(i=>(!filt.type||i.type===filt.type)&&(!q||nameOf(i).toLowerCase().includes(q)||C.offers.some(o=>o.itemId===i.id&&((o.vendor||'')+' '+(o.sku||'')+' '+(o.item||'')).toLowerCase().includes(q)))).sort((a,b)=>a.type.localeCompare(b.type)||nameOf(a).localeCompare(nameOf(b)));
    const types=['Fermentable','Hop','Yeast','Misc','Supply'], have=new Set(C.items.filter(i=>i.bfId).map(i=>i.bfId));
    let h=`<div class="pur-note">The catalog is your <b>current ordering menu</b>: every ingredient or supply you reorder, with each vendor option for it (vendor, SKU, link, pack size, last price). Your purchase <i>history</i> lives in the Purchases ledger, and recording an order updates the last price and date here. The ★ marks the <b>default offer</b> the Order List uses for that item.</div>
      <div class="pur-tools"><input id="pur-q" type="search" placeholder="Search item, vendor, SKU" value="${esc(filt.q)}">
      <select id="pur-type"><option value="">All types</option>${types.map(t=>`<option ${filt.type===t?'selected':''}>${t}</option>`).join('')}</select>
      <button class="ocd-btn ghost" id="ai-toggle">+ Add item</button>
      <span class="pur-dim">${items.length} items · ${C.offers.filter(o=>o.itemId).length} vendor offers linked · ${unmatched().length} offers not matched yet</span></div>`;
    if(addItemOpen) h+=`<div class="pur-add"><label>Brewfather item <select id="ai-bf"><option value="">Not in Brewfather (supply item)</option>${inv().filter(i=>!have.has(i.bf_id)).sort((a,b)=>a.name.localeCompare(b.name)).map(i=>`<option value="${esc(i.bf_id)}">${esc(i.name)} (${esc(i.type)})</option>`).join('')}</select></label>
      <label>Name (for a supply item) <input id="ai-name" type="text" placeholder="e.g. Silicone gaskets"></label><label>Unit <input id="ai-unit" type="text" placeholder="each, kg, ml" style="width:90px"></label><button class="ocd-btn" id="ai-add">Add to catalog</button></div>`;
    const have2=new Set(C.items.filter(i=>i.bfId).map(i=>gid(i.bfId))), missing=inv().filter(v=>!have2.has(v.bf_id)), mTypes=missing.reduce((a,v)=>{a[v.type]=(a[v.type]||0)+1;return a;},{});
    h+=missing.length?`<div class="pur-pend"><b>${missing.length}</b> Brewfather inventory items are not in the catalog yet (${Object.entries(mTypes).map(([t,n])=>n+' '+t.toLowerCase()+(n===1?'':'s')).join(', ')}). <button class="ocd-btn" id="add-missing">Add them all</button></div>`:'';
    const renamed=C.items.filter(i=>i.bfId&&bfById().get(i.bfId)&&bfById().get(i.bfId).name!==i.name);
    const syncAt=(OCD.get()||{}).bfSyncTime;
    h+=`<div class="pur-tools"><span class="pur-dim">Recipes: ${RC?Object.keys(RC.byName).length+' cached ('+new Date(RC.fetchedAt).toLocaleDateString()+')':'not loaded'}</span> <button class="ocd-btn ghost" data-reloadrec="1">${RC?'Reload':'Load'} recipes from Brewfather</button>
      <span class="pur-dim">Inventory counts as of ${syncAt?new Date(syncAt).toLocaleString():'the last nightly sync'}</span> <button class="ocd-btn ghost" id="inv-refresh">Refresh inventory from Brewfather</button></div>`+
      (renamed.length?`<div class="pur-pend">${renamed.length} item${renamed.length===1?' was':'s were'} renamed in Brewfather (the catalog already shows the new names). <button class="ocd-btn" id="names-update">Save the new names</button></div>`:'');
    if(!C.items.length) return h+`<div class="pur-empty">No catalog items yet. Open <b>Match review</b> to link your imported vendor offers to Brewfather items.</div>`;
    h+='<div class="pur-wrap"><table><thead><tr><th></th><th>Item</th><th>Type</th><th>BF supplier</th><th class="n">On hand (BF)</th><th>Min stock (BF unit)</th><th>Max per brew</th><th class="n">Recipes</th><th class="n">Offers</th><th>Default offer</th></tr></thead><tbody>';
    items.forEach(it=>{
      const offs=C.offers.filter(o=>o.itemId===it.id), b=it.bfId?by.get(it.bfId):null, open=expanded.has(it.id), pref=prefOffer(it,offs), unit=itemUnit(it,by), us=usage()[gid(it.bfId)];
      h+=`<tr class="it ${open?'open':''} ${it.restock===false?'norest':''}" data-it="${esc(it.id)}"><td class="tg">${open?'▾':'▸'}</td><td class="nm">${esc(nameOf(it))}${it.restock===false?' <span class="pur-warn">don\'t restock</span>':''}</td><td>${esc(it.type)}</td><td>${b?esc(b.bf_supplier||'—'):'—'}</td>
        <td class="n">${b&&b.onHand!=null?esc(String(Math.round(b.onHand*100)/100))+' '+esc(b.unit||b.purchaseUnit||''):'—'}</td>
        ${minCell(it,offs,unit)}${maxCell(it,offs,unit,us)}<td class="n">${us?us.count:(RC?0:'—')}</td>
        <td class="n">${offs.length}</td><td>${pref?esc(pref.vendor||'?')+(pref.sku?' · '+esc(pref.sku):''):'—'}</td></tr>`;
      if(!open) return;
      const usL=(us&&us.list)||[];
      const mem=it.bfId&&b?(b.members||[]):[], ign=new Set(it.bfIgnore||[]);
      const memHtml=mem.length?`<div class="uses"><b>Brewfather inventory counted for this item:</b> `+mem.map(m=>`<label class="chk"><input type="checkbox" data-bfign="${esc(it.id)}|${esc(m.bf_id)}" ${ign.has(m.bf_id)?'':'checked'}> ${esc(m.name)}${m.bf_supplier?' · '+esc(m.bf_supplier):''} · ${fq(Number(m.onHand)||0)} ${esc(m.unit||'')}${(Number(m.onHand)||0)<0?' <span class="pur-dim">(negative counts as 0)</span>':''}</label>`).join(' ')+`</div>`:'';
      h+=`<tr class="offs"><td></td><td colspan="9">${memHtml}<div class="uses"><label class="chk"><input type="checkbox" data-norest="${esc(it.id)}" ${it.restock===false?'checked':''}> Don't restock (leave off the Order List)</label>
        ${it.bfId?'':`<button class="lnk" data-rename="${esc(it.id)}">rename</button> `}<button class="lnk" data-delitem="${esc(it.id)}">remove item from catalog</button></div>`+
        (usL.length?`<div class="uses"><b>Used in ${usL.length} recipe${usL.length===1?'':'s'}:</b> ${usL.map(x=>{const bn=latestBatchOf(x.recipe);return `${esc(x.recipe)}${bn?' (batch #'+esc(String(bn))+')':''} ${fq(x.amount)} ${esc(unit)}`;}).join(' · ')} ${it.bfId&&us?`<button class="lnk" data-usemax="${esc(it.id)}">set minimum = largest brew (${fq(us.max)} ${esc(unit)})</button>`:''}</div>`:'')+
        `<table class="in"><thead><tr><th></th><th>Vendor</th><th>SKU</th><th>Link</th><th>Pack (vendor units)</th><th>Metric</th><th class="n">Last price</th><th class="n">per metric unit</th><th>Last bought</th><th></th></tr></thead><tbody>`+
        offs.map(o=>{
          if(editOff===o.id) return `<tr class="editrow" data-eoid="${esc(o.id)}"><td></td><td><input class="e-vendor" value="${esc(o.vendor||'')}" placeholder="Vendor"></td><td><input class="e-sku" value="${esc(o.sku||'')}" placeholder="SKU"></td><td><input class="e-link" value="${esc(o.link||'')}" placeholder="https://…"></td>
            <td><input class="e-pack" type="number" step="any" value="${o.packSize==null?'':esc(String(o.packSize))}" style="width:64px"> <select class="e-unit">${unitOpts(o.unit)}</select></td>
            <td colspan="2"><input class="e-price" type="number" step="0.01" value="${o.lastPrice==null?'':esc(String(o.lastPrice))}" style="width:78px"> <span class="pur-dim">last price</span></td><td></td>
            <td colspan="2"><label class="pur-dim">Belongs to <select class="e-belongs">${C.items.slice().sort((x,y)=>nameOf(x).localeCompare(nameOf(y))).map(x=>`<option value="${esc(x.id)}" ${x.id===o.itemId?'selected':''}>${esc(nameOf(x))}</option>`).join('')}</select></label>
            <div class="pur-dim" style="margin:3px 0">As purchased: ${esc((o.item||'').replace(/\s+/g,' ').slice(0,70))}</div><button class="ocd-btn" data-saveoff="${esc(o.id)}">Save</button> <button class="ocd-btn ghost" data-canceloff="1">Cancel</button></td></tr>`;
          const m=metric(o.packSize,o.unit);
          return `<tr><td><button class="star ${it.preferredOfferId===o.id?'on':''}" data-star="${esc(o.id)}" data-item="${esc(it.id)}" title="Default offer for the Order List">★</button></td>
          <td>${esc(o.vendor||'—')}</td><td class="mono">${esc(o.sku||'—')}</td><td>${o.link?`<a href="${esc(o.link)}" target="_blank" rel="noopener">open ↗</a>`:'—'}</td>
          <td>${o.packSize!=null?esc(String(o.packSize))+' '+esc(o.unit||''):'—'}</td><td>${fmtQty(m)}</td><td class="n">${money(o.lastPrice)}</td>
          <td class="n">${m&&o.lastPrice!=null?'$'+(o.lastPrice/m.qty).toFixed(m.qty>=100?4:2)+'/'+esc(m.unit):'—'}</td><td>${esc(o.lastDate||'—')}</td>
          <td><button class="lnk" data-editoff="${esc(o.id)}">edit</button> <button class="lnk" data-deloff="${esc(o.id)}">remove</button></td></tr>`;}).join('')+
        offerFormRow(it.id,false)+'</tbody></table></td></tr>';
    });
    return h+'</tbody></table></div>';
  }


  // A malt "grade" number (30L, 80L, 120L, 100) must agree between what you bought and the Brewfather item; years, % and pack sizes are ignored.
  const gradeNums=s=>{ s=String(s||'').toLowerCase().replace(/\(.*?\)/g,' ').replace(/\d+(\.\d+)?\s*%/g,' ').replace(/\b\d+(\.\d+)?\s*(lbs?|oz|ozs|gal|pk|pack|kg|ml|liters?|l\b(?=\s*(of|bag|sack))|g)\b/g,' ');
    return new Set((s.match(/\b\d{2,3}\s*l?\b/g)||[]).map(x=>x.replace(/\D/g,'')).filter(x=>!/^(19|20)\d\d$/.test(x))); };
  const sameSet=(a,b)=>a.size===b.size&&[...a].every(x=>b.has(x));
  function gradeConflict(offerName,bfName){ const a=gradeNums(offerName), b=gradeNums(bfName); return a.size>0&&b.size>0&&!sameSet(a,b); }
  const inferForm=s=>{ s=String(s||'').toLowerCase(); return /pellet|t-?90/.test(s)?'pellet':/whole|cone|\bleaf\b/.test(s)?'whole':/co2|extract/.test(s)?'extract':null; };
  function suspects(){ const by=bfById(), itemById=new Map(C.items.map(i=>[i.id,i])); const out=[];
    C.offers.forEach(o=>{ if(!o.itemId||o.checkedOk) return; const it=itemById.get(o.itemId); if(!it||!it.bfId) return; const b=by.get(it.bfId); if(!b) return;
      if(it.type==='Fermentable'){ if(!gradeConflict(o.item,b.name)) return; const g=gradeNums(o.item);
        const sug=inv().filter(x=>x.type===it.type&&x.bf_id!==b.bf_id&&sameSet(gradeNums(x.name),g)&&x.name.toLowerCase().split(/\s+/)[0]===b.name.toLowerCase().split(/\s+/)[0]);
        out.push({offer:o,item:it,cur:nameOf(it),sug,why:'grade'}); return; }
      if(it.type==='Hop'){ const f=inferForm(o.item), cur=DemandCalc.normForm(b.bf_type), same=inv().filter(x=>x.type==='Hop'&&x.bf_id!==b.bf_id&&DemandCalc.stripYear(x.name)===DemandCalc.stripYear(b.name));
        if(f&&f!==cur) out.push({offer:o,item:it,cur:nameOf(it),sug:same.filter(x=>DemandCalc.normForm(x.bf_type)===f),why:'form'});
        else if(!f&&same.length) out.push({offer:o,item:it,cur:nameOf(it),sug:same,why:'unknown form'}); } });
    return out; }

  // ---------------- Match review ----------------
  function reviewHtml(){
    const tabs=[['check','Check matches'],['auto','Confirm confident matches'],['review','Review'],['weak','Weak / none'],['other','Everything else'],['hist','History only']];
    let h='<div class="pur-bar sub2">'+tabs.map(([k,l])=>`<button class="pur-sub ${rtab===k?'on':''}" data-rtab="${k}">${l} <span class="pur-count">${k==='check'?suspects().length:k==='hist'?C.offers.filter(o=>o.matchStatus==='historyOnly').length:queue(k).length}</span></button>`).join('')+'</div>';
    if(rtab==='check'){ const sx=suspects(); if(!sx.length) return h+'<div class="pur-empty">No suspicious matches found.</div>';
      return h+`<div class="pur-note">These offers may be linked to the wrong item: a malt whose <b>grade</b> differs (60L vs 80L), or a hop in the wrong <b>form</b> (pellet vs whole). Where the purchase name doesn't say the form, choose it. Move each one to the right item.</div><div class="pur-wrap"><table><thead><tr><th>Purchased as</th><th>Vendor · SKU</th><th>Currently linked to</th><th>Move to</th></tr></thead><tbody>`+
        sx.map(s=>`<tr><td class="nm">${esc(s.offer.item.replace(/\s+/g,' '))}</td><td>${esc(s.offer.vendor||'')} <span class="mono">${esc(s.offer.sku||'')}</span></td><td>${esc(s.cur)}${s.why==='unknown form'?' <span class="pur-dim">(form not in the name)</span>':''}</td><td>${s.sug.map(x=>`<button class="ocd-btn" data-fix="${esc(s.offer.id)}|${esc(x.bf_id)}">${esc(x.label||x.name)}</button>`).join(' ')||'<span class="pur-dim">no matching Brewfather item - use the Catalog to add one</span>'} <button class="lnk" data-fixok="${esc(s.offer.id)}">it is correct</button></td></tr>`).join('')+'</tbody></table></div>'; }
    const q=queue(rtab);
    if(!q.length) return h+`<div class="pur-empty">Nothing left in this list${nPend()?'. Remember to save your waiting decisions.':'.'}</div>`;
    if(rtab==='auto'){
      const by=bfById(); const rows=q.slice().sort((a,b)=>(a.matchScore||0)-(b.matchScore||0));
      return h+`<div class="pur-note">Each line shows the vendor item and the Brewfather item it was matched to. Untick any that are wrong (lowest scores first), then add the ticked ones.</div>
        <div class="pur-wrap"><table><thead><tr><th>Use</th><th>Purchased as</th><th>Vendor · SKU</th><th>Matched Brewfather item</th><th class="n">Score</th></tr></thead><tbody>`+
        rows.map(o=>{const b=by.get(o.proposedBfId);const bad=b&&gradeConflict(o.item,b.name); return `<tr><td><input type="checkbox" class="a-chk" data-oid="${esc(o.id)}" ${bad?'':'checked'}></td><td class="nm">${esc(o.item)}</td><td>${esc(o.vendor||'')} <span class="mono">${esc(o.sku||'')}</span></td><td>${b?esc(b.name):'?'}${bad?' <span class="pur-warn">grade differs</span>':''}</td><td class="n">${(o.matchScore||0).toFixed(2)}</td></tr>`;}).join('')+
        `</tbody></table></div><div class="pur-tools"><button class="ocd-btn" id="auto-add">Add ticked matches to waiting decisions</button></div>`;
    }
    if(rtab==='hist'){ const hs=C.offers.filter(o=>o.matchStatus==='historyOnly'); if(!hs.length) return h+'<div class="pur-empty">Nothing marked history-only.</div>';
      return h+`<div class="pur-note">Offers you chose not to track for reordering. They stay in your Purchases ledger.</div><div class="pur-wrap"><table><thead><tr><th>Purchased as</th><th>Category</th><th>Vendor</th><th></th></tr></thead><tbody>`+hs.slice(0,200).map(o=>`<tr><td class="nm">${esc(o.item.replace(/\s+/g,' ').slice(0,90))}</td><td>${esc(o.category||'')}</td><td>${esc(o.vendor||'')}</td><td><button class="lnk" data-histback="${esc(o.id)}">bring back</button></td></tr>`).join('')+'</tbody></table></div>'; }
    if(rtab==='other'){
      const base=queue('other'), cats=[...new Set(base.map(o=>o.category||'(none)'))].sort(), ql=oth.q.toLowerCase();
      const rows=base.filter(o=>(!oth.cat||(o.category||'(none)')===oth.cat)&&(!ql||(o.item+' '+(o.vendor||'')).toLowerCase().includes(ql)));
      return h+`<div class="pur-note"><b>These are already in your Purchases ledger.</b> Nothing here has to be moved. Choose what to do with each offer: <b>History only</b> (one-off buys you won't reorder through the dashboard) or <b>Supply item</b> (something you keep a minimum of and reorder, like gaskets or cleaners). Tick several rows to act on them together.</div>
        <div class="pur-tools"><input id="oth-q" type="search" placeholder="Search" value="${esc(oth.q)}"><select id="oth-cat"><option value="">All categories</option>${cats.map(c=>`<option ${oth.cat===c?'selected':''}>${esc(c)}</option>`).join('')}</select>
        <button class="ocd-btn" id="oth-hist">History only: ticked</button><button class="ocd-btn ghost" id="oth-hist-all">History only: all ${rows.length} shown</button><button class="ocd-btn ghost" id="oth-supply">Supply items: ticked</button></div>
        <div class="pur-wrap"><table><thead><tr><th><input type="checkbox" id="oth-all"></th><th>Purchased as</th><th>Category</th><th>Vendor</th><th class="n">Last price</th></tr></thead><tbody>`+
        rows.slice(0,300).map(o=>`<tr><td><input type="checkbox" class="o-chk" data-oid="${esc(o.id)}"></td><td class="nm">${esc(o.item.replace(/\s+/g,' ').slice(0,90))}</td><td>${esc(o.category||'')}</td><td>${esc(o.vendor||'')}</td><td class="n">${money(o.lastPrice)}</td></tr>`).join('')+`</tbody></table></div>${rows.length>300?'<div class="pur-dim">Showing the first 300. Filter to narrow it down.</div>':''}`;
    }
    // one-at-a-time cards for review / weak / none
    card=Math.min(card,q.length-1); const o=q[card], all=inv().slice().sort((a,b)=>a.name.localeCompare(b.name));
    const cands=(o.candidates||[]), by=bfById();
    return h+`<div class="pur-card"><div class="pur-prog">${card+1} of ${q.length}</div>
      <div class="pc-name">${esc(o.item.replace(/\s+/g,' '))}</div>
      <div class="pc-meta">${esc(o.category||'')} · ${esc(o.vendor||'')} ${o.sku?'· SKU '+esc(o.sku):''} · ${o.packSize!=null?esc(String(o.packSize))+' '+esc(o.unit||''):''} · last ${money(o.lastPrice)} ${o.link?`· <a href="${esc(o.link)}" target="_blank" rel="noopener">vendor page ↗</a>`:''}</div>
      <div class="pc-q">Which Brewfather item is this?</div>
      ${cands.map((c,i)=>`<label class="pc-opt"><input type="radio" name="pick" value="bf:${esc(c.bfId)}" ${i===0&&c.score>=.6?'checked':''}> ${esc(c.name)} <span class="pur-dim">(${c.score.toFixed(2)})</span></label>`).join('')}
      <label class="pc-opt"><input type="radio" name="pick" value="other"> Other: <select id="pc-other"><option value="">choose a Brewfather item…</option>${all.map(b=>`<option value="${esc(b.bf_id)}">${esc(b.name)} (${esc(b.type)})</option>`).join('')}</select></label>
      <label class="pc-opt"><input type="radio" name="pick" value="supply"> Not in Brewfather: supply item named <input id="pc-supply" type="text" value="${esc(o.item.replace(/\s+/g,' ').slice(0,60))}"></label>
      <label class="pc-opt"><input type="radio" name="pick" value="skip"> Skip, don't track this one</label>
      <div class="pc-btns"><button class="ocd-btn ghost" id="pc-prev" ${card?'':'disabled'}>Back</button> <button class="ocd-btn" id="pc-ok">Confirm</button> <button class="ocd-btn ghost" id="pc-skip">Decide later</button></div></div>`;
  }


  // ---------------- Demand + Order List ----------------
  const RKEY='ocd_recipes'; let RC=null, dem={weeks:26,type:'',onlyOrder:true}, sel={}, qtyOv={}, demCache=null;
  try{ RC=JSON.parse(localStorage.getItem(RKEY)||'null'); }catch(e){}
  const slim=r=>({name:r.name,batchSize:r.batchSize,fermentables:(r.fermentables||[]).map(x=>({name:x.name,amount:x.amount,unit:x.unit,type:x.type})),
    hops:(r.hops||[]).map(x=>({name:x.name,amount:x.amount,unit:x.unit,type:x.type,use:x.use})),
    yeasts:(r.yeasts||[]).map(x=>({name:x.name,amount:x.amount,unit:x.unit,laboratory:x.laboratory,productId:x.productId})),
    miscs:(r.miscs||[]).map(x=>({name:x.name,amount:x.amount,unit:x.unit,type:x.type}))});
  async function reloadRecipes(){
    const u=localStorage.getItem('ontap_bf_userid'), k=localStorage.getItem('ontap_bf_apikey');
    if(!u||!k){ msg('Save your Brewfather User ID and API key first (Operations & Cellar, then Settings).',true); return; }
    msg('Loading recipes from Brewfather…');
    try{ const out=[]; let start=null;
      for(let pg=0;pg<20;pg++){ const url='https://api.brewfather.app/v2/recipes?limit=50&complete=true'+(start?'&start_after='+encodeURIComponent(start):'');
        const r=await fetch(url,{headers:{Authorization:'Basic '+btoa(u+':'+k)}}); if(!r.ok) throw new Error('Brewfather returned HTTP '+r.status);
        const a=await r.json(); if(!Array.isArray(a)||!a.length) break; out.push(...a); if(a.length<50) break; start=a[a.length-1]._id; }
      const byName={}; out.forEach(r=>{ if(r.name) byName[r.name.toLowerCase()]=slim(r); });
      RC={fetchedAt:new Date().toISOString(),byName}; try{localStorage.setItem(RKEY,JSON.stringify(RC));}catch(e){}
      msg('Loaded '+Object.keys(byName).length+' recipes.'); render();
    }catch(e){ msg(e.message,true); }
  }
  function plannedBrews(weeks){
    const d=OCD.get(), E=window.SchedulerEngine, R=E.build(d), today=R.today, cutoff=E.addDays(today,weeks*7), sched=[];
    R.schedule.forEach(w=>{ if(w.sat<today||w.sat>cutoff) return; (w.brews||[]).forEach(b=>{ if(b.beer) sched.push({batch:b.batch,name:b.beer.name,date:E.fmtISO(w.sat)}); }); });
    const have=new Set(sched.map(b=>b.batch)), cache=d.bfBatchCache||{};
    const hist=(d.history||[]).filter(h=>{ if(have.has(h.batch)) return false; const st=(cache[h.batch]||{}).status||h.bfStatus||''; if(st!=='Planning') return false; if(!h.date) return true; const bd=E.parseDate(h.date); return !bd||bd<=cutoff; })
      .map(h=>({batch:h.batch,name:h.name,date:h.date||''}));
    return hist.concat(sched);
  }
  function computeAll(){
    const d=OCD.get(); if(!d||!window.SchedulerEngine||!window.DemandCalc) return null;
    const brews=plannedBrews(dem.weeks), invL=inv();
    const dm=DemandCalc.computeDemand(brews,b=>RC&&RC.byName[(b.name||'').toLowerCase()],invL);
    const rows=DemandCalc.shortfalls(dm.rows,invL,C?C.items:[],grp().groupOf);
    return {brews,uncached:dm.uncached,rows};
  }
  const qn=n=>n==null?'—':(Math.abs(n)>=100?n.toFixed(0):Math.abs(n)>=10?n.toFixed(1):n.toFixed(2));
  function demandHeader(extra){
    const age=RC?new Date(RC.fetchedAt).toLocaleDateString():null;
    return `<div class="pur-tools"><label>Look ahead <select id="dm-weeks">${[8,12,26,52].map(w=>`<option value="${w}" ${dem.weeks===w?'selected':''}>${w} weeks</option>`).join('')}</select></label>
      ${extra||''}<span class="pur-dim">${RC?Object.keys(RC.byName).length+' recipes cached ('+age+')':'No recipes cached yet'}</span> <button class="ocd-btn ghost" id="dm-reload">Reload recipes from Brewfather</button></div>`;
  }
  function demandHtml(){
    if(!RC) return demandHeader()+'<div class="pur-empty">Load your recipes from Brewfather first. They are kept in this browser only.</div>';
    const a=computeAll(); if(!a) return demandHeader()+'<div class="pur-empty">Schedule data is not ready yet.</div>'; demCache=a;
    let rows=a.rows.filter(r=>(!dem.type||r.type===dem.type)&&(!dem.onlyOrder||r.order>0||!r.matched)).sort((x,y)=>(y.order>0)-(x.order>0)||x.type.localeCompare(y.type)||x.name.localeCompare(y.name));
    const hdr=demandHeader(`<label>Type <select id="dm-type"><option value="">All</option>${['Fermentable','Hop','Yeast','Misc'].map(t=>`<option ${dem.type===t?'selected':''}>${t}</option>`).join('')}</select></label>
      <label><input type="checkbox" id="dm-only" ${dem.onlyOrder?'checked':''}> only items to order</label>`);
    let h=hdr+`<div class="pur-note">${a.brews.length} planned brews in the next ${dem.weeks} weeks${a.uncached?` · <b>${a.uncached} have no cached recipe</b> (the beer name must match a Brewfather recipe name)`:''}. To order = minimum stock − (on hand − needed). Items without a minimum stock only order what the brews need beyond what you have.</div>`;
    h+='<div class="pur-wrap"><table><thead><tr><th></th><th>Ingredient</th><th>Type</th><th class="n">Needed</th><th class="n">On hand</th><th class="n">Min stock</th><th class="n">After brews</th><th class="n">To order</th></tr></thead><tbody>';
    rows.forEach(r=>{ const k=esc(r.key), open=expanded.has('d:'+r.key);
      h+=`<tr class="it dm ${open?'open':''}" data-dm="${k}"><td class="tg">${r.refs.length?(open?'▾':'▸'):''}</td><td class="nm">${esc(r.name)}${!r.matched?' <span class="pur-warn">not in inventory</span>':''}${r.unitMismatch?' <span class="pur-warn">check units</span>':''}${r.noRestock?' <span class="pur-warn">don\'t restock</span>':''}</td><td>${esc(r.type)}</td>
        <td class="n">${qn(r.total)} ${esc(r.unit)}</td><td class="n">${r.onHand==null?'—':qn(r.onHand)}</td><td class="n">${r.minStock==null?'—':qn(r.minStock)}</td>
        <td class="n ${r.projected<0?'neg':''}">${r.onHand==null?'—':qn(r.projected)}</td><td class="n ${r.order>0?'ord':''}">${r.order>0?qn(r.order)+' '+esc(r.unit):'—'}</td></tr>`;
      if(open) h+=`<tr class="offs"><td></td><td colspan="7"><table class="in"><thead><tr><th>Batch</th><th>Beer</th><th>Brew date</th><th class="n">Amount</th></tr></thead><tbody>`+r.refs.map(f=>`<tr><td>#${esc(f.batch)}</td><td>${esc(f.beer)}</td><td>${esc(f.date||'—')}</td><td class="n">${qn(f.rawAmount)} ${esc(f.rawUnit)}</td></tr>`).join('')+'</tbody></table></td></tr>';
    });
    return h+(rows.length?'':'<tr><td colspan="8" class="pur-empty">Nothing to order for this window.</td></tr>')+'</tbody></table></div>';
  }
  function offerFor(item){ if(!item) return null; const offs=C.offers.filter(o=>o.itemId===item.id); if(!offs.length) return null;
    return offs.find(o=>o.id===(sel[item.id]||item.preferredOfferId))||offs.slice().sort((a,b)=>(b.lastDate||'').localeCompare(a.lastDate||''))[0]; }
  const ordForm=iid=>`<tr class="addrow"><td colspan="8"><div class="ordform"><b>New offer:</b> <input class="a-vendor" placeholder="Vendor"> <input class="a-sku" placeholder="SKU"> <input class="a-link" placeholder="https://…">
    <input class="a-pack" type="number" step="any" placeholder="pack size" style="width:84px"> <select class="a-unit">${unitOpts()}</select> <input class="a-price" type="number" step="0.01" placeholder="price" style="width:78px">
    <button class="ocd-btn" data-addoff="${esc(iid)}" data-select="1">Add and use it</button></div></td></tr>`;
  function orderHtml(){
    if(!RC) return demandHeader()+'<div class="pur-empty">Load your recipes from Brewfather first (button above).</div>';
    const a=computeAll(); if(!a) return demandHeader()+'<div class="pur-empty">Schedule data is not ready yet.</div>';
    const lines=[], noVendor=[];
    a.rows.filter(r=>r.order>0&&r.matched).forEach(r=>{
      const it=r.catalogItem, off=offerFor(it), pq=off?DemandCalc.packQuantity(off,r.unit,S.units,r.order):null;
      if(!off||!pq){ noVendor.push(r); return; }
      const ov=qtyOv[r.key]; lines.push({r,it,off,pq,packs:ov!=null?ov.packs:pq.packs,inc:ov?ov.inc!==false:true});
    });
    const byV=new Map(); lines.forEach(l=>{ const v=l.off.vendor||'(no vendor)'; if(!byV.has(v)) byV.set(v,[]); byV.get(v).push(l); });
    let h=demandHeader()+`<div class="pur-note">Suggested orders for the next ${a.brews.length?dem.weeks:dem.weeks} weeks, grouped by vendor. Packs are rounded up from what is needed. Change the quantity or the vendor offer, untick lines you don't want, then open each vendor page to add the items to your cart.</div>`;
    if(!lines.length&&!noVendor.length) return h+'<div class="pur-empty">Nothing needs ordering for this window.</div>';
    [...byV.entries()].sort((x,y)=>x[0].localeCompare(y[0])).forEach(([v,ls])=>{
      const sub=ls.filter(l=>l.inc).reduce((s,l)=>s+(l.off.lastPrice!=null?l.packs*l.off.lastPrice:0),0);
      h+=`<div class="ord-v"><div class="ord-vh"><b>${esc(v)}</b><span class="pur-dim">${ls.filter(l=>l.inc).length} lines · est. $${sub.toFixed(2)}</span><button class="lnk" data-copyv="${esc(v)}">copy order text</button></div>
        <div class="pur-wrap"><table><thead><tr><th></th><th>Item</th><th class="n">Need to buy</th><th>Offer</th><th class="n">Packs</th><th>SKU</th><th>Link</th><th class="n">Est. cost</th></tr></thead><tbody>`+
        ls.map(l=>{ const offs=C.offers.filter(o=>o.itemId===l.it.id);
          return `<tr data-ok="${esc(l.r.key)}"><td><input type="checkbox" class="o-inc" ${l.inc?'checked':''}></td><td class="nm">${esc(l.r.name)}</td><td class="n">${qn(l.r.order)} ${esc(l.r.unit)}</td>
          <td><select class="o-off" data-item="${esc(l.it.id)}">${offs.map(o=>`<option value="${esc(o.id)}" ${o.id===l.off.id?'selected':''}>${esc((o.vendor||'?')+' · '+(o.packSize!=null?o.packSize+' '+(o.unit||''):'')+' · '+money(o.lastPrice))}</option>`).join('')}<option value="__new">＋ add a new offer…</option></select></td>
          <td class="n"><input class="o-qty" type="number" min="0" step="1" value="${l.packs}" style="width:64px"></td><td class="mono">${esc(l.off.sku||'—')}</td>
          <td>${l.off.link?`<a href="${esc(l.off.link)}" target="_blank" rel="noopener">open ↗</a>`:'—'}</td><td class="n">${l.off.lastPrice!=null?'$'+(l.packs*l.off.lastPrice).toFixed(2):'—'}</td></tr>${newOfferFor===l.it.id?ordForm(l.it.id):''}`; }).join('')+'</tbody></table></div></div>';
    });
    if(noVendor.length) h+=`<div class="ord-v"><div class="ord-vh"><b>No usable vendor offer yet</b><span class="pur-dim">${noVendor.length} items need ordering. Add an offer for each, or open the Catalog.</span></div><div class="pur-wrap"><table><thead><tr><th>Item</th><th class="n">Need to buy</th><th></th><th></th><th></th><th></th><th></th><th></th></tr></thead><tbody>`+
      noVendor.map(r=>`<tr><td class="nm">${esc(r.name)}</td><td class="n">${qn(r.order)} ${esc(r.unit)}</td><td colspan="6">${r.catalogItem?`<button class="lnk" data-neworder="${esc(r.catalogItem.id)}">add an offer…</button>`:`<button class="lnk" data-mkitem="${esc(r.bfId||'')}">add to catalog</button>`}</td></tr>${r.catalogItem&&newOfferFor===r.catalogItem.id?ordForm(r.catalogItem.id):''}`).join('')+'</tbody></table></div></div>';
    return h;
  }

  // ---------------- saving ----------------
  function applyDecisions(cat,decisions,invList){
    const byBf=new Map(cat.items.filter(i=>i.bfId).map(i=>[gid(i.bfId),i]));
    let next=Math.max(0,...cat.items.map(i=>parseInt(String(i.id).slice(1))||0))+1; const nid=()=>'I'+String(next++).padStart(4,'0');
    for(const [oid,dec] of Object.entries(decisions)){
      const off=cat.offers.find(o=>o.id===oid); if(!off) continue;
      if(dec.skip){ off.matchStatus='skipped'; continue; }
      let item=null;
      if(dec.bfId){ const g=gid(dec.bfId); item=byBf.get(g); if(!item){ const b=invList.find(x=>x.bf_id===dec.bfId); if(!b) continue; item={id:nid(),name:b.name,type:b.type,bfId:g,unit:b.unit||b.purchaseUnit||null,minStock:null}; cat.items.push(item); byBf.set(g,item); } }
      else if(dec.supply){ const nm=String(dec.supply).trim(); if(!nm) continue; item=cat.items.find(i=>!i.bfId&&i.name.toLowerCase()===nm.toLowerCase()); if(!item){ item={id:nid(),name:nm,type:'Supply',bfId:null,unit:null,minStock:null}; cat.items.push(item); } }
      if(!item) continue; off.itemId=item.id; off.matchStatus='confirmed';
    }
  }
  async function saveDecisions(){
    const d=Object.assign({},pend), n=Object.keys(d).length; msg('Saving '+n+' decisions to the private repo…');
    try{ C=await OCD.books.save('catalog.json',o=>{o.items=o.items||[];o.offers=o.offers||[];applyDecisions(o,d,rawInv());},'Match '+n+' catalog offers to Brewfather items (dashboard)'); C.items=C.items||[];
      pend={}; savePend(); msg('Saved '+n+' decisions.'); render(); }catch(e){ msg(e.message,true); }
  }
  async function mutate(fn,message,okMsg){
    try{ msg('Saving…'); C=await OCD.books.save('catalog.json',o=>{o.items=o.items||[];o.offers=o.offers||[];fn(o);},message); C.items=C.items||[]; msg(okMsg||'Saved.'); render(); }catch(e){ msg(e.message,true); render(); }
  }

  function wire(){
    if(wired) return; wired=true; const root=$('pur');
    root.addEventListener('click',e=>{
      const t=e.target; let b;
      if((b=t.closest('[data-sub]'))){ sub=b.dataset.sub; render(); return; }
      if((b=t.closest('[data-rtab]'))){ rtab=b.dataset.rtab; card=0; render(); return; }
      if(t.closest('#pur-save')){ saveDecisions(); return; }
      if(t.closest('#pur-discard')){ if(confirm('Discard the waiting match decisions?')){ pend={}; savePend(); render(); } return; }

      if(t.closest('#dm-reload')){ reloadRecipes(); return; }
      if((b=t.closest('tr.dm'))){ const k='d:'+b.dataset.dm; expanded.has(k)?expanded.delete(k):expanded.add(k); render(); return; }
      if((b=t.closest('[data-copyv]'))){ const v=b.dataset.copyv, a=demCache||computeAll(); let txt='Order for '+v+'\n';
        root.querySelectorAll('.ord-v').forEach(box=>{ if(box.querySelector('.ord-vh b').textContent!==v) return; box.querySelectorAll('tbody tr').forEach(tr=>{ const inc=tr.querySelector('.o-inc'); if(inc&&!inc.checked) return; const c=tr.children; txt+='- '+c[1].textContent+' x '+tr.querySelector('.o-qty').value+' ('+c[5].textContent+') '+((tr.querySelector('a')||{}).href||'')+'\n'; }); });
        navigator.clipboard&&navigator.clipboard.writeText(txt).then(()=>msg('Order text copied.')); return; }
      if((b=t.closest('[data-usemax]'))){ const iid=b.dataset.usemax, it=C.items.find(i=>i.id===iid), us=usage()[gid(it.bfId)]; if(us) mutate(o=>{const x=o.items.find(i=>i.id===iid); if(x){ x.minStock=Math.ceil(us.max*100)/100; delete x.minStockEntry; }},'Set minimum stock to the largest brew (dashboard)','Minimum stock set.'); return; }
      if(t.closest('.minstock,.a-vendor,.a-sku,.a-link,.a-pack,.a-unit,.a-price,.e-vendor,.e-sku,.e-link,.e-pack,.e-unit,.e-price,.e-belongs,#ai-bf,#ai-name,#ai-unit,.o-off,.o-qty,.o-inc,[data-norest],[data-bfign],.o-chk,#oth-q,#oth-cat,#oth-all,a')) return;
      if(t.closest('#ai-toggle')){ addItemOpen=!addItemOpen; render(); return; }
      if(t.closest('#ai-add')){ const bf=$('ai-bf').value, nm=$('ai-name').value.trim(), un=$('ai-unit').value.trim();
        if(!bf&&!nm){ msg('Choose a Brewfather item, or type a name for a supply item.',true); return; }
        const b0=bf?bfById().get(bf):null; addItemOpen=false;
        mutate(o=>{ const n=Math.max(0,...o.items.map(i=>parseInt(String(i.id).slice(1))||0))+1; const id='I'+String(n).padStart(4,'0');
          o.items.push(b0?{id,name:b0.name,type:b0.type,bfId:b0.bf_id,unit:b0.unit||b0.purchaseUnit||null,minStock:null}:{id,name:nm,type:'Supply',bfId:null,unit:un||'each',minStock:null}); },'Add catalog item (dashboard)','Item added. Open it to add vendor offers.'); return; }
      if((b=t.closest('[data-fix]'))){ const [oid,bid]=b.dataset.fix.split('|'), v0=bfById().get(bid); if(!v0) return; const g=v0.bf_id;
        mutate(o=>{ let it=o.items.find(i=>gid(i.bfId)===g); if(!it){ const n=Math.max(0,...o.items.map(i=>parseInt(String(i.id).slice(1))||0))+1; it={id:'I'+String(n).padStart(4,'0'),name:v0.name,type:v0.type,bfId:g,unit:v0.unit||v0.purchaseUnit||null,minStock:null}; o.items.push(it); }
          const off=o.offers.find(x=>x.id===oid); if(!off) return; const old=o.items.find(i=>i.id===off.itemId); if(old&&old.preferredOfferId===oid) old.preferredOfferId=null; off.itemId=it.id; off.matchStatus='confirmed'; },'Correct a catalog match (dashboard)','Offer moved.'); return; }
      if((b=t.closest('[data-fixok]'))){ const oid=b.dataset.fixok; mutate(o=>{const off=o.offers.find(x=>x.id===oid); if(off) off.checkedOk=true;},'Confirm a catalog match (dashboard)','Marked as correct.'); return; }
      if(t.closest('[data-reloadrec]')){ reloadRecipes(); return; }
      if(t.closest('#inv-refresh')){ refreshInventory(); return; }
      if(t.closest('#add-missing')){ const have=new Set(C.items.filter(i=>i.bfId).map(i=>gid(i.bfId))), add=inv().filter(v=>!have.has(v.bf_id)).map(v=>({name:v.name,type:v.type,bfId:v.bf_id,unit:v.unit||v.purchaseUnit||null}));
        mutate(o=>{ const h2=new Set(o.items.filter(i=>i.bfId).map(i=>gid(i.bfId))); let n=Math.max(0,...o.items.map(i=>parseInt(String(i.id).slice(1))||0))+1; add.forEach(a=>{ if(h2.has(a.bfId)) return; o.items.push(Object.assign({id:'I'+String(n++).padStart(4,'0'),minStock:null},a)); h2.add(a.bfId); }); },'Add Brewfather inventory items to the catalog (dashboard)','Added '+add.length+' items.'); return; }
      if(t.closest('#names-update')){ mutate(o=>{ const m=bfById(); o.items.forEach(i=>{ const b=i.bfId&&m.get(i.bfId); if(b&&b.name!==i.name) i.name=b.name; }); },'Update catalog item names from Brewfather (dashboard)','Names updated.'); return; }
      if((b=t.closest('[data-rename]'))){ const iid=b.dataset.rename, it=C.items.find(i=>i.id===iid), nn=prompt('New name for this item:',it.name); if(nn&&nn.trim()&&nn.trim()!==it.name) mutate(o=>{const x=o.items.find(i=>i.id===iid); if(x) x.name=nn.trim();},'Rename catalog item (dashboard)','Renamed.'); return; }
      const ticked=()=>[...root.querySelectorAll('.o-chk:checked')].map(c=>c.dataset.oid);
      const setHist=ids=>{ if(!ids.length){ msg('Tick at least one row first.',true); return; } mutate(o=>{ o.offers.forEach(x=>{ if(ids.includes(x.id)&&!x.itemId) x.matchStatus='historyOnly'; }); },'Mark '+ids.length+' catalog offers as history only (dashboard)',ids.length+' offers marked history only.'); };
      if(t.closest('#oth-hist')){ setHist(ticked()); return; }
      if(t.closest('#oth-hist-all')){ const ql=oth.q.toLowerCase(); setHist(queue('other').filter(o=>(!oth.cat||(o.category||'(none)')===oth.cat)&&(!ql||(o.item+' '+(o.vendor||'')).toLowerCase().includes(ql))).map(o=>o.id)); return; }
      if(t.closest('#oth-supply')){ const ids=ticked(); if(!ids.length){ msg('Tick at least one row first.',true); return; } ids.forEach(id=>{ const o=C.offers.find(x=>x.id===id); if(o) pend[id]={supply:o.item.replace(/\s+/g,' ').slice(0,60)}; }); savePend(); render(); return; }
      if(t.closest('#oth-all')){ const on=t.closest('#oth-all').checked; root.querySelectorAll('.o-chk').forEach(c=>c.checked=on); return; }
      if((b=t.closest('[data-histback]'))){ const oid=b.dataset.histback; mutate(o=>{const x=o.offers.find(y=>y.id===oid); if(x) delete x.matchStatus;},'Bring back a catalog offer (dashboard)','Brought back.'); return; }
      if((b=t.closest('[data-neworder]'))){ newOfferFor=b.dataset.neworder; render(); return; }
      if((b=t.closest('[data-editoff]'))){ editOff=b.dataset.editoff; render(); return; }
      if(t.closest('[data-canceloff]')){ editOff=null; render(); return; }
      if((b=t.closest('[data-saveoff]'))){ const oid=b.dataset.saveoff, row=b.closest('tr'), g=c=>row.querySelector(c);
        const rec={vendor:g('.e-vendor').value.trim()||null,sku:g('.e-sku').value.trim()||null,link:g('.e-link').value.trim()||null,packSize:parseFloat(g('.e-pack').value)||null,unit:g('.e-unit').value,lastPrice:g('.e-price').value===''?null:parseFloat(g('.e-price').value)}, belongs=g('.e-belongs').value;
        editOff=null; expanded.add(belongs);
        mutate(o=>{ const off=o.offers.find(x=>x.id===oid); if(!off) throw new Error('That offer no longer exists.'); Object.assign(off,rec);
          if(belongs&&belongs!==off.itemId){ const old=o.items.find(i=>i.id===off.itemId); if(old&&old.preferredOfferId===oid) old.preferredOfferId=null; off.itemId=belongs; } },'Edit vendor offer (dashboard)','Offer saved.'); return; }
      if((b=t.closest('[data-delitem]'))){ const iid=b.dataset.delitem; if(confirm('Remove this item from the catalog? Its vendor offers stay saved and go back to the Match review lists.'))
        mutate(o=>{ o.items=o.items.filter(i=>i.id!==iid); o.offers.forEach(x=>{ if(x.itemId===iid){ x.itemId=null; delete x.matchStatus; } }); },'Remove catalog item (dashboard)','Item removed.'); return; }
      if((b=t.closest('[data-mkitem]'))){ const bid=b.dataset.mkitem, b0=bfById().get(bid); if(!b0) return; expanded.add('mk:'+bid);
        mutate(o=>{ if(o.items.some(i=>i.bfId===bid)) return; const n=Math.max(0,...o.items.map(i=>parseInt(String(i.id).slice(1))||0))+1; o.items.push({id:'I'+String(n).padStart(4,'0'),name:b0.name,type:b0.type,bfId:bid,unit:b0.unit||b0.purchaseUnit||null,minStock:null}); },'Add catalog item (dashboard)','Added to the catalog. Now add a vendor offer.'); return; }
      if((b=t.closest('[data-star]'))){ const oid=b.dataset.star, iid=b.dataset.item; mutate(o=>{const it=o.items.find(i=>i.id===iid); if(it) it.preferredOfferId=(it.preferredOfferId===oid?null:oid);},'Set preferred offer (dashboard)'); return; }
      if((b=t.closest('[data-deloff]'))){ const oid=b.dataset.deloff; if(confirm('Remove this vendor offer from the catalog?')) mutate(o=>{o.offers=o.offers.filter(x=>x.id!==oid);},'Remove vendor offer (dashboard)'); return; }
      if((b=t.closest('[data-addoff]'))){ const iid=b.dataset.addoff, row=b.closest('tr'), g=c=>row.querySelector(c), pickIt=b.dataset.select==='1';
        const vendor=g('.a-vendor').value.trim(); if(!vendor){ msg('Enter at least a vendor.',true); return; }
        const rec={vendor,sku:g('.a-sku').value.trim()||null,link:g('.a-link').value.trim()||null,packSize:parseFloat(g('.a-pack').value)||null,unit:g('.a-unit').value,lastPrice:parseFloat(g('.a-price').value)||null,lastDate:new Date().toISOString().slice(0,10),timesBought:0};
        let newId=null;
        mutate(o=>{const it=o.items.find(i=>i.id===iid); const n=Math.max(0,...o.offers.map(x=>parseInt(String(x.id).slice(1))||0))+1; newId='O'+String(n).padStart(4,'0'); o.offers.push(Object.assign({id:newId,item:it?it.name:'',category:null,itemId:iid,matchStatus:'confirmed'},rec));},'Add vendor offer for an item (dashboard)').then(()=>{ if(pickIt&&newId){ sel[iid]=newId; newOfferFor=null; render(); } }); return; }
      if((b=t.closest('[data-supply]'))){ const oid=b.dataset.supply; const off=C.offers.find(o=>o.id===oid); pend[oid]={supply:off.item.replace(/\s+/g,' ').slice(0,60)}; savePend(); render(); return; }
      if(t.closest('#auto-add')){ root.querySelectorAll('.a-chk').forEach(c=>{ if(c.checked){ const o=C.offers.find(x=>x.id===c.dataset.oid); if(o) pend[o.id]={bfId:o.proposedBfId}; } }); savePend(); render(); return; }
      if(t.closest('#pc-ok')){ const q=queue(rtab), o=q[Math.min(card,q.length-1)]; const pick=root.querySelector('input[name=pick]:checked'); if(!pick){ msg('Choose an option first.',true); return; }
        const v=pick.value; if(v==='skip') pend[o.id]={skip:true}; else if(v==='supply'){ const nm=$('pc-supply').value.trim(); if(!nm){ msg('Name the supply item.',true); return; } pend[o.id]={supply:nm}; }
        else if(v==='other'){ const sel=$('pc-other').value; if(!sel){ msg('Pick a Brewfather item from the list.',true); return; } pend[o.id]={bfId:sel}; } else pend[o.id]={bfId:v.slice(3)};
        msg(''); savePend(); render(); return; }
      if(t.closest('#pc-skip')){ card=card+1; render(); return; }
      if(t.closest('#pc-prev')){ card=Math.max(0,card-1); render(); return; }
      if((b=t.closest('tr.it'))){ const id=b.dataset.it; expanded.has(id)?expanded.delete(id):expanded.add(id); render(); return; }
    });
    root.addEventListener('input',e=>{ if(e.target.id==='oth-q'){ oth.q=e.target.value; const pos=e.target.selectionStart; render(); const q=$('oth-q'); if(q){q.focus();q.setSelectionRange(pos,pos);} return; }
      if(e.target.id==='pur-q'){ filt.q=e.target.value; const pos=e.target.selectionStart; render(); const q=$('pur-q'); if(q){q.focus();q.setSelectionRange(pos,pos);} } });
    root.addEventListener('change',e=>{
      if(e.target.id==='dm-weeks'){ dem.weeks=parseInt(e.target.value); render(); return; }
      if(e.target.id==='dm-type'){ dem.type=e.target.value; render(); return; }
      if(e.target.id==='dm-only'){ dem.onlyOrder=e.target.checked; render(); return; }
      const oo=e.target.closest('.o-off'); if(oo){ if(oo.value==='__new'){ newOfferFor=oo.dataset.item; } else { sel[oo.dataset.item]=oo.value; newOfferFor=null; } render(); return; }
      const oq=e.target.closest('.o-qty'); if(oq){ const k=oq.closest('tr').dataset.ok; qtyOv[k]=Object.assign(qtyOv[k]||{},{packs:Math.max(0,parseInt(oq.value)||0)}); render(); return; }
      const oi=e.target.closest('.o-inc'); if(oi){ const k=oi.closest('tr').dataset.ok; qtyOv[k]=Object.assign(qtyOv[k]||{packs:null},{inc:oi.checked}); if(qtyOv[k].packs===null) delete qtyOv[k].packs; render(); return; }
      if(e.target.id==='oth-cat'){ oth.cat=e.target.value; render(); return; }
      if(e.target.id==='pur-type'){ filt.type=e.target.value; render(); return; }
      const bi=e.target.closest('[data-bfign]'); if(bi){ const [iid,mid]=bi.dataset.bfign.split('|'), on=bi.checked; mutate(o=>{const it=o.items.find(i=>i.id===iid); if(!it) return; const s=new Set(it.bfIgnore||[]); if(on) s.delete(mid); else s.add(mid); if(s.size) it.bfIgnore=[...s]; else delete it.bfIgnore;},'Choose which Brewfather inventory items count (dashboard)','Saved.'); return; }
      const nr=e.target.closest('[data-norest]'); if(nr){ const iid=nr.dataset.norest, on=nr.checked; mutate(o=>{const it=o.items.find(i=>i.id===iid); if(!it) return; if(on) it.restock=false; else delete it.restock;},(on?"Don't restock ":'Restock ')+'item (dashboard)',on?"Marked don't restock.":'Back on the order list.'); return; }
      const ms=e.target.closest('.minstock'); if(ms){ const iid=ms.dataset.ms, v=ms.value===''?null:parseFloat(ms.value);
        mutate(o=>{const it=o.items.find(i=>i.id===iid); if(!it) return; it.minStock=(v===null||isNaN(v))?null:v; delete it.minStockEntry;},'Set minimum stock (dashboard)','Minimum stock saved.'); }
    });
  }
  return{ mount(){ if(started) return; started=true; wire(); OCD.ready.then(()=>{ if(!OCD.gh.has()){ msg('Add your GitHub token in Settings to open the purchasing data.',true); return; } load(); }); },
          reload(){ if(started) { if(OCD.gh.has()) load(); } } };
})();
