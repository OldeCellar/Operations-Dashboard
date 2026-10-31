(window.OCD_V=window.OCD_V||{})['purchasing.js']='0.2.0';
/* Purchasing tab (private bookkeeping repo): Catalog = items (tied to Brewfather inventory) with their vendor offers (vendor, SKU, link, pack size),
   plus a match review that links the offers imported from your workbook to Brewfather items. Later: Purchases, Order List, Costs. */
window.Purchasing=(()=>{
  let started=false,wired=false,C=null,S=null,sub='catalog',rtab='auto',card=0,expanded=new Set(),filt={q:'',type:''},addFor=null;
  const PKEY='ocd_books_pending';
  let pend={}; try{pend=JSON.parse(localStorage.getItem(PKEY)||'{}')}catch(e){}
  const $=id=>document.getElementById(id);
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const inv=()=>((OCD.get()||{}).packaging||{}).inventory||[];
  const bfById=()=>new Map(inv().map(i=>[i.bf_id,i]));
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
  const unmatched=()=>C.offers.filter(o=>!o.itemId);
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

  // ---------------- Catalog ----------------
  function catalogHtml(){
    const by=bfById(), q=filt.q.toLowerCase();
    const items=C.items.filter(i=>(!filt.type||i.type===filt.type)&&(!q||i.name.toLowerCase().includes(q)||C.offers.some(o=>o.itemId===i.id&&((o.vendor||'')+' '+(o.sku||'')+' '+(o.item||'')).toLowerCase().includes(q)))).sort((a,b)=>a.type.localeCompare(b.type)||a.name.localeCompare(b.name));
    const types=['Fermentable','Hop','Yeast','Misc','Supply'];
    let h=`<div class="pur-tools"><input id="pur-q" type="search" placeholder="Search item, vendor, SKU" value="${esc(filt.q)}">
      <select id="pur-type"><option value="">All types</option>${types.map(t=>`<option ${filt.type===t?'selected':''}>${t}</option>`).join('')}</select>
      <span class="pur-dim">${items.length} items · ${C.offers.filter(o=>o.itemId).length} vendor offers linked · ${unmatched().length} offers not matched yet</span></div>`;
    if(!C.items.length) return h+`<div class="pur-empty">No catalog items yet. Open <b>Match review</b> to link your imported vendor offers to Brewfather items.</div>`;
    h+='<div class="pur-wrap"><table><thead><tr><th></th><th>Item</th><th>Type</th><th class="n">On hand (BF)</th><th class="n">Min stock</th><th class="n">Offers</th><th>Best known offer</th></tr></thead><tbody>';
    items.forEach(it=>{
      const offs=C.offers.filter(o=>o.itemId===it.id), b=it.bfId?by.get(it.bfId):null, open=expanded.has(it.id);
      const pref=offs.find(o=>o.id===it.preferredOfferId)||offs.slice().sort((a,b)=>(b.lastDate||'').localeCompare(a.lastDate||''))[0];
      h+=`<tr class="it ${open?'open':''}" data-it="${esc(it.id)}"><td class="tg">${open?'▾':'▸'}</td><td class="nm">${esc(it.name)}</td><td>${esc(it.type)}</td>
        <td class="n">${b&&b.onHand!=null?esc(String(Math.round(b.onHand*100)/100))+' '+esc(b.purchaseUnit||''):'—'}</td>
        <td class="n"><input class="minstock" data-ms="${esc(it.id)}" type="number" step="any" min="0" value="${it.minStock==null?'':esc(String(it.minStock))}" placeholder="—"></td>
        <td class="n">${offs.length}</td><td>${pref?esc(pref.vendor||'?')+(pref.sku?' · '+esc(pref.sku):''):'—'}</td></tr>`;
      if(open){
        h+=`<tr class="offs"><td></td><td colspan="6"><table class="in"><thead><tr><th></th><th>Vendor</th><th>SKU</th><th>Link</th><th>Pack (vendor units)</th><th>Metric</th><th class="n">Last price</th><th class="n">per metric unit</th><th>Last bought</th><th></th></tr></thead><tbody>`+
        offs.map(o=>{const m=metric(o.packSize,o.unit);return `<tr><td><button class="star ${it.preferredOfferId===o.id?'on':''}" data-star="${esc(o.id)}" data-item="${esc(it.id)}" title="Preferred offer">★</button></td>
          <td>${esc(o.vendor||'—')}</td><td class="mono">${esc(o.sku||'—')}</td><td>${o.link?`<a href="${esc(o.link)}" target="_blank" rel="noopener">open ↗</a>`:'—'}</td>
          <td>${o.packSize!=null?esc(String(o.packSize))+' '+esc(o.unit||''):'—'}</td><td>${fmtQty(m)}</td><td class="n">${money(o.lastPrice)}</td>
          <td class="n">${m&&o.lastPrice!=null?'$'+(o.lastPrice/m.qty).toFixed(m.qty>=100?4:2)+'/'+esc(m.unit):'—'}</td><td>${esc(o.lastDate||'—')}</td>
          <td><button class="lnk" data-deloff="${esc(o.id)}">remove</button></td></tr>`;}).join('')+
        `<tr class="addrow"><td></td><td><input class="a-vendor" placeholder="Vendor"></td><td><input class="a-sku" placeholder="SKU"></td><td><input class="a-link" placeholder="https://…"></td>
          <td><input class="a-pack" type="number" step="any" placeholder="size" style="width:64px"> <select class="a-unit">${Object.keys(S.units||{}).map(u=>`<option>${esc(u)}</option>`).join('')}</select></td><td></td>
          <td><input class="a-price" type="number" step="0.01" placeholder="price" style="width:78px"></td><td></td><td></td><td><button class="ocd-btn" data-addoff="${esc(it.id)}">Add offer</button></td></tr></tbody></table></td></tr>`;
      }
    });
    return h+'</tbody></table></div>';
  }

  // ---------------- Match review ----------------
  function reviewHtml(){
    const tabs=[['auto','Confirm confident matches'],['review','Review'],['weak','Weak / none'],['other','Everything else']];
    let h='<div class="pur-bar sub2">'+tabs.map(([k,l])=>`<button class="pur-sub ${rtab===k?'on':''}" data-rtab="${k}">${l} <span class="pur-count">${queue(k).length}</span></button>`).join('')+'</div>';
    const q=queue(rtab);
    if(!q.length) return h+`<div class="pur-empty">Nothing left in this list${nPend()?'. Remember to save your waiting decisions.':'.'}</div>`;
    if(rtab==='auto'){
      const by=bfById(); const rows=q.slice().sort((a,b)=>(a.matchScore||0)-(b.matchScore||0));
      return h+`<div class="pur-note">Each line shows the vendor item and the Brewfather item it was matched to. Untick any that are wrong (lowest scores first), then add the ticked ones.</div>
        <div class="pur-wrap"><table><thead><tr><th>Use</th><th>Purchased as</th><th>Vendor · SKU</th><th>Matched Brewfather item</th><th class="n">Score</th></tr></thead><tbody>`+
        rows.map(o=>{const b=by.get(o.proposedBfId);return `<tr><td><input type="checkbox" class="a-chk" data-oid="${esc(o.id)}" checked></td><td class="nm">${esc(o.item)}</td><td>${esc(o.vendor||'')} <span class="mono">${esc(o.sku||'')}</span></td><td>${b?esc(b.name):'?'}</td><td class="n">${(o.matchScore||0).toFixed(2)}</td></tr>`;}).join('')+
        `</tbody></table></div><div class="pur-tools"><button class="ocd-btn" id="auto-add">Add ticked matches to waiting decisions</button></div>`;
    }
    if(rtab==='other'){
      const rows=q.slice(0,200);
      return h+`<div class="pur-note">Offers for equipment, parts and other things that are not Brewfather ingredients. Turn the ones you reorder into supply items so they can have a minimum stock and show on the order list. ${q.length>200?'Showing the first 200.':''}</div>
        <div class="pur-wrap"><table><thead><tr><th>Purchased as</th><th>Category</th><th>Vendor</th><th class="n">Last price</th><th></th></tr></thead><tbody>`+
        rows.map(o=>`<tr><td class="nm">${esc(o.item.replace(/\s+/g,' ').slice(0,90))}</td><td>${esc(o.category||'')}</td><td>${esc(o.vendor||'')}</td><td class="n">${money(o.lastPrice)}</td>
          <td><button class="lnk" data-supply="${esc(o.id)}">make supply item</button></td></tr>`).join('')+'</tbody></table></div>';
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
    const rows=DemandCalc.shortfalls(dm.rows,invL,C?C.items:[]);
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
      h+=`<tr class="it dm ${open?'open':''}" data-dm="${k}"><td class="tg">${r.refs.length?(open?'▾':'▸'):''}</td><td class="nm">${esc(r.name)}${!r.matched?' <span class="pur-warn">not in inventory</span>':''}${r.unitMismatch?' <span class="pur-warn">check units</span>':''}</td><td>${esc(r.type)}</td>
        <td class="n">${qn(r.total)} ${esc(r.unit)}</td><td class="n">${r.onHand==null?'—':qn(r.onHand)}</td><td class="n">${r.minStock==null?'—':qn(r.minStock)}</td>
        <td class="n ${r.projected<0?'neg':''}">${r.onHand==null?'—':qn(r.projected)}</td><td class="n ${r.order>0?'ord':''}">${r.order>0?qn(r.order)+' '+esc(r.unit):'—'}</td></tr>`;
      if(open) h+=`<tr class="offs"><td></td><td colspan="7"><table class="in"><thead><tr><th>Batch</th><th>Beer</th><th>Brew date</th><th class="n">Amount</th></tr></thead><tbody>`+r.refs.map(f=>`<tr><td>#${esc(f.batch)}</td><td>${esc(f.beer)}</td><td>${esc(f.date||'—')}</td><td class="n">${qn(f.rawAmount)} ${esc(f.rawUnit)}</td></tr>`).join('')+'</tbody></table></td></tr>';
    });
    return h+(rows.length?'':'<tr><td colspan="8" class="pur-empty">Nothing to order for this window.</td></tr>')+'</tbody></table></div>';
  }
  function offerFor(item){ if(!item) return null; const offs=C.offers.filter(o=>o.itemId===item.id); if(!offs.length) return null;
    return offs.find(o=>o.id===(sel[item.id]||item.preferredOfferId))||offs.slice().sort((a,b)=>(b.lastDate||'').localeCompare(a.lastDate||''))[0]; }
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
          <td>${offs.length>1?`<select class="o-off" data-item="${esc(l.it.id)}">${offs.map(o=>`<option value="${esc(o.id)}" ${o.id===l.off.id?'selected':''}>${esc((o.vendor||'?')+' · '+(o.packSize!=null?o.packSize+' '+(o.unit||''):'')+' · '+money(o.lastPrice))}</option>`).join('')}</select>`:esc((l.off.packSize!=null?l.off.packSize+' '+(l.off.unit||''):'')+' · '+money(l.off.lastPrice))}</td>
          <td class="n"><input class="o-qty" type="number" min="0" step="1" value="${l.packs}" style="width:64px"></td><td class="mono">${esc(l.off.sku||'—')}</td>
          <td>${l.off.link?`<a href="${esc(l.off.link)}" target="_blank" rel="noopener">open ↗</a>`:'—'}</td><td class="n">${l.off.lastPrice!=null?'$'+(l.packs*l.off.lastPrice).toFixed(2):'—'}</td></tr>`; }).join('')+'</tbody></table></div></div>';
    });
    if(noVendor.length) h+=`<div class="ord-v"><div class="ord-vh"><b>No vendor offer yet</b><span class="pur-dim">${noVendor.length} items need ordering but have no usable offer. Add one in the Catalog.</span></div><div class="pur-wrap"><table><thead><tr><th>Item</th><th class="n">Need to buy</th></tr></thead><tbody>`+
      noVendor.map(r=>`<tr><td class="nm">${esc(r.name)}</td><td class="n">${qn(r.order)} ${esc(r.unit)}</td></tr>`).join('')+'</tbody></table></div></div>';
    return h;
  }

  // ---------------- saving ----------------
  function applyDecisions(cat,decisions,invList){
    const byBf=new Map(cat.items.filter(i=>i.bfId).map(i=>[i.bfId,i]));
    let next=Math.max(0,...cat.items.map(i=>parseInt(String(i.id).slice(1))||0))+1; const nid=()=>'I'+String(next++).padStart(4,'0');
    for(const [oid,dec] of Object.entries(decisions)){
      const off=cat.offers.find(o=>o.id===oid); if(!off) continue;
      if(dec.skip){ off.matchStatus='skipped'; continue; }
      let item=null;
      if(dec.bfId){ item=byBf.get(dec.bfId); if(!item){ const b=invList.find(x=>x.bf_id===dec.bfId); if(!b) continue; item={id:nid(),name:b.name,type:b.type,bfId:b.bf_id,unit:b.purchaseUnit||null,minStock:null}; cat.items.push(item); byBf.set(b.bf_id,item); } }
      else if(dec.supply){ const nm=String(dec.supply).trim(); if(!nm) continue; item=cat.items.find(i=>!i.bfId&&i.name.toLowerCase()===nm.toLowerCase()); if(!item){ item={id:nid(),name:nm,type:'Supply',bfId:null,unit:null,minStock:null}; cat.items.push(item); } }
      if(!item) continue; off.itemId=item.id; off.matchStatus='confirmed';
    }
  }
  async function saveDecisions(){
    const d=Object.assign({},pend), n=Object.keys(d).length; msg('Saving '+n+' decisions to the private repo…');
    try{ C=await OCD.books.save('catalog.json',o=>{o.items=o.items||[];o.offers=o.offers||[];applyDecisions(o,d,inv());},'Match '+n+' catalog offers to Brewfather items (dashboard)'); C.items=C.items||[];
      pend={}; savePend(); msg('Saved '+n+' decisions.'); render(); }catch(e){ msg(e.message,true); }
  }
  async function mutate(fn,message,okMsg){
    try{ msg('Saving…'); C=await OCD.books.save('catalog.json',o=>{o.items=o.items||[];o.offers=o.offers||[];fn(o);},message); msg(okMsg||'Saved.'); render(); }catch(e){ msg(e.message,true); render(); }
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
      if(t.closest('.minstock')||t.closest('.a-vendor,.a-sku,.a-link,.a-pack,.a-unit,.a-price')) return;
      if((b=t.closest('[data-star]'))){ const oid=b.dataset.star, iid=b.dataset.item; mutate(o=>{const it=o.items.find(i=>i.id===iid); if(it) it.preferredOfferId=(it.preferredOfferId===oid?null:oid);},'Set preferred offer (dashboard)'); return; }
      if((b=t.closest('[data-deloff]'))){ const oid=b.dataset.deloff; if(confirm('Remove this vendor offer from the catalog?')) mutate(o=>{o.offers=o.offers.filter(x=>x.id!==oid);},'Remove vendor offer (dashboard)'); return; }
      if((b=t.closest('[data-addoff]'))){ const iid=b.dataset.addoff, row=b.closest('tr'), g=c=>row.querySelector(c);
        const vendor=g('.a-vendor').value.trim(); if(!vendor){ msg('Enter at least a vendor.',true); return; }
        const rec={vendor,sku:g('.a-sku').value.trim()||null,link:g('.a-link').value.trim()||null,packSize:parseFloat(g('.a-pack').value)||null,unit:g('.a-unit').value,lastPrice:parseFloat(g('.a-price').value)||null,lastDate:new Date().toISOString().slice(0,10),timesBought:0};
        mutate(o=>{const it=o.items.find(i=>i.id===iid); const n=Math.max(0,...o.offers.map(x=>parseInt(String(x.id).slice(1))||0))+1; o.offers.push(Object.assign({id:'O'+String(n).padStart(4,'0'),item:it?it.name:'',category:null,itemId:iid,matchStatus:'confirmed'},rec));},'Add vendor offer for an item (dashboard)'); return; }
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
    root.addEventListener('input',e=>{ if(e.target.id==='pur-q'){ filt.q=e.target.value; const pos=e.target.selectionStart; render(); const q=$('pur-q'); if(q){q.focus();q.setSelectionRange(pos,pos);} } });
    root.addEventListener('change',e=>{
      if(e.target.id==='dm-weeks'){ dem.weeks=parseInt(e.target.value); render(); return; }
      if(e.target.id==='dm-type'){ dem.type=e.target.value; render(); return; }
      if(e.target.id==='dm-only'){ dem.onlyOrder=e.target.checked; render(); return; }
      const oo=e.target.closest('.o-off'); if(oo){ sel[oo.dataset.item]=oo.value; render(); return; }
      const oq=e.target.closest('.o-qty'); if(oq){ const k=oq.closest('tr').dataset.ok; qtyOv[k]=Object.assign(qtyOv[k]||{},{packs:Math.max(0,parseInt(oq.value)||0)}); render(); return; }
      const oi=e.target.closest('.o-inc'); if(oi){ const k=oi.closest('tr').dataset.ok; qtyOv[k]=Object.assign(qtyOv[k]||{packs:null},{inc:oi.checked}); if(qtyOv[k].packs===null) delete qtyOv[k].packs; render(); return; }
      if(e.target.id==='pur-type'){ filt.type=e.target.value; render(); return; }
      const ms=e.target.closest('.minstock'); if(ms){ const iid=ms.dataset.ms, v=ms.value===''?null:parseFloat(ms.value);
        mutate(o=>{const it=o.items.find(i=>i.id===iid); if(it) it.minStock=(v===null||isNaN(v))?null:v;},'Set minimum stock (dashboard)','Minimum stock saved.'); }
    });
  }
  return{ mount(){ if(started) return; started=true; wire(); OCD.ready.then(()=>{ if(!OCD.gh.has()){ msg('Add your GitHub token in Settings to open the purchasing data.',true); return; } load(); }); },
          reload(){ if(started) { if(OCD.gh.has()) load(); } } };
})();
