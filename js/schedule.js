(window.OCD_V=window.OCD_V||{})['schedule.js']='0.4.1';
/* Production Schedule tab (read-only). All scheduling decisions come from SchedulerEngine (the Scheduler v33.28 code). */
window.ProductionSchedule=(()=>{
  let started=false,wired=false,R=null,tlOffset=0;
  const $=id=>document.getElementById(id), E=()=>window.SchedulerEngine;
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const D=d=>d?d.toLocaleDateString('en-US',{month:'short',day:'numeric'}):'—';
  const DW=d=>d?d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}):'—';
  const DAY=86400000, TANKS=['Tank 01','Tank 02','Tank 03'];

  function tanksHtml(){
    return R.tanksNow.map(t=>{
      if(!t.beer) return `<div class="tankcard empty"><div class="tn">${t.name}</div><div class="tb">Empty</div><div class="tm">Ready for the next brew</div></div>`;
      const left=t.endDate?Math.round((t.endDate-R.today)/DAY):null;
      return `<div class="tankcard" style="--c:${E().clr(t.beer)}"><div class="tn">${t.name}</div>
        <div class="tb">${esc(t.beer.name)} <small>#${esc(t.batch)}${t.seq?' · brew '+t.seq:''}</small></div>
        <div class="tm">${esc(t.bfStatus||'')}</div>
        <div class="tm">Brewed ${D(t.brewDate)} → keg ${D(t.endDate)}${left!==null?' ('+(left>=0?left+' d left':Math.abs(left)+' d past')+')':''}</div></div>`;
    }).join('');
  }
  function idleGap(tank,sat){
    const t=R.gaps.tanks.find(x=>x.name===tank); if(!t) return null; const end=E().addDays(sat,7);
    const g=t.gaps.find(x=>x.from<end&&x.to>sat); if(!g) return null;
    const i=X?X.slots.findIndex(x=>x.declineKey===g.declineKey&&x.status==='open'):-1;
    return {g,open:i>=0,i};
  }
  function timelineHtml(){
    const W=12,COL=80,LABEL=90,weeks=E().timelineWeeks(tlOffset,W);
    $('sch-tl-label').textContent=D(weeks[0].sat)+' – '+D(weeks[W-1].sat);
    const grid=`display:grid;grid-template-columns:${LABEL}px repeat(${W},${COL}px);`;
    let h=`<div style="min-width:${LABEL+COL*W}px"><div style="${grid}margin-bottom:6px"><div></div>`;
    weeks.forEach(w=>{const now=w.sat<=R.today&&E().addDays(w.sat,7)>R.today;h+=`<div class="tlh${now?' now':''}">${D(w.sat)}${now?' ▼':''}</div>`;});
    h+='</div>';
    TANKS.forEach(tn=>{
      h+=`<div style="${grid}margin-bottom:3px;align-items:center"><div class="tlt">${tn}</div>`;
      weeks.forEach(w=>{
        if(w.skipped){h+=`<div class="tle skip" title="${esc(w.skipReason||'No brew')}"></div>`;return;}
        const b=(w.brews||[]).find(x=>x.tank===tn);
        if(b&&b.beer) h+=`<div class="tlc" style="background:${E().clr(b.beer)}" title="${esc(b.beer.name)} #${b.seq||''} · keg ${D(b.kegDate)}">${esc(b.beer.name.split(' ').slice(0,2).join(' '))}</div>`;
        else if(b) h+=`<div class="tlc" style="background:#6a6050" title="Batch ${esc(b.batch)}">#${esc(b.batch)}</div>`;
        else { const g=idleGap(tn,w.sat); h+=g?`<div class="tle idle${g.open?' open':''}" ${g.open?`data-slot="${g.i}"`:''} title="${g.open?'Idle — an extra brew fits here (click)':'Idle tank time'} · ${D(g.g.from)} → ${D(g.g.to)} (${g.g.idle} d)"></div>`:'<div class="tle"></div>'; }
      });
      h+='</div>';
    });
    const used=new Set(); weeks.forEach(w=>(w.brews||[]).forEach(b=>b.beer&&used.add(b.beer.type||b.beer.style)));
    h+='<div class="legend">'+[...used].map(s=>`<span><i style="background:${E().STYLE_CLR[s]||'#6a6050'}"></i>${esc(s)}</span>`).join('')+'</div></div>';
    return h;
  }
  // ---- Open slots: extra Mon/Tue brews that fill idle tank time (accept / not now), saved via OCD.save ----
  let X=null;                                           // result of E().extraSlots(R)
  const dayName=d=>d.toLocaleDateString('en-US',{weekday:'long'});
  const normX=o=>{const x=o.extraBrews||{};o.extraBrews=Object.assign({},x,{dow:Number.isInteger(x.dow)?x.dow:1,accepted:Array.isArray(x.accepted)?x.accepted:[],declined:Array.isArray(x.declined)?x.declined:[]});return o.extraBrews;};
  function needToken(){ if(OCD.gh.has()) return false; OCDSettings.open('To accept or decline extra brews, paste your GitHub token and click Save & test.'); return true; }
  function flash(t,err){ const el=$('sch-flash'); if(!el) return; el.textContent=t; el.className='sch-flash'+(err?' err':''); setTimeout(()=>{el.textContent='';},6000); }
  async function act(mutator,msg,done){
    if(needToken()) return;
    try{ await OCD.save(mutator,msg); render(); flash(done); }catch(e){ flash(e.message,true); }
  }
  function fitsHtml(slotIdx,optIdx){
    const o=X.slots[slotIdx].open[optIdx];
    const seen=new Set(), fits=o.fits.filter(f=>!seen.has(f.beer.name)&&seen.add(f.beer.name));
    return fits.map((f,i)=>`<label class="fitrow"><input type="radio" name="fit-${slotIdx}" value="${esc(f.beer.name)}" ${i===0?'checked':''}> <b>${esc(f.beer.name)}</b>
      <span class="dim">${f.beer.t} d in tank · kegs ${dash(f.keg)} · ${f.slack?f.slack+' d spare':'exact fit'}${f.offLane?' · off-lane':''}</span></label>`).join('');
  }
  function acceptedHtml(){
    if(!X.accepted.length) return '';
    return '<div class="acc"><b>Accepted extra brews</b>'+X.accepted.map(a=>`<div class="accrow" data-id="${esc(a.id)}"><span class="nm">${esc(a.beer)}</span> <span class="dim">${esc(a.tank)}</span>
        <input type="date" class="a-date" value="${esc(a.iso)}"> <span class="dim">${dayName(a.date)}</span> <button class="ocd-btn ghost a-remove">Remove</button></div>`).join('')+'</div>';
  }
  function slotsHtml(){
    const open=X.slots.filter(x=>x.status==='open'), none=X.slots.filter(x=>x.status==='none').length;
    let h=`<div class="slotshead"><h3>Open slots <small>${open.length} extra brew${open.length===1?'':'s'} could fill idle tank time</small></h3></div>`;
    if(!open.length) h+=`<div class="slotnone">No idle stretch is long enough for a beer to fit${none?' ('+none+' shorter gap'+(none===1?'':'s')+' checked)':''}.</div>`;
    else h+='<div class="slotgrid">'+open.map(x=>{
      const i=X.slots.indexOf(x);
      return `<div class="slot" id="sch-slot-${i}" data-i="${i}">
        <div class="sh"><b>${esc(x.tank)}</b> idle ${D(x.from)} → ${D(x.to)} <span class="idl">${x.idle} days</span></div>
        <div class="sm">${x.emptyNow?'Empty now. ':''}Next scheduled in this tank: ${esc(x.nextBeer.name)} on ${DW(x.to)}</div>
        <label class="lbl">Brew day <select class="s-date">${x.open.map((o,j)=>`<option value="${j}">${dash(o.date)} (${dayName(o.date)})</option>`).join('')}</select></label>
        <div class="fits">${fitsHtml(i,0)}</div>
        <div class="sa"><button class="ocd-btn s-accept">Accept extra brew</button> <button class="ocd-btn ghost s-decline">Not now</button></div></div>`;
    }).join('')+'</div>';
    h+='<div class="slotfoot">';
    if(X.declinedCount) h+=`<div class="dim">${X.declinedCount} declined suggestion${X.declinedCount===1?'':'s'} · <a href="#" class="s-restore">show again</a></div>`;
    return h+'<div class="dim rule">Rule: Monday or Tuesday only, at most one extra brew per week, never on a day that already has a brew.</div></div>';
  }
  function wireSlots(){
    [$('sch-accepted'),$('sch-slots')].forEach(box=>{
    box.addEventListener('change',e=>{ const sel=e.target.closest('.s-date'); if(sel){ const card=sel.closest('.slot'); card.querySelector('.fits').innerHTML=fitsHtml(+card.dataset.i,+sel.value); return; }
      const ad=e.target.closest('.a-date'); if(ad&&ad.value){ const id=ad.closest('.accrow').dataset.id, iso=ad.value;
        act(o=>{const ax=normX(o).accepted, x=ax.find(y=>y.id===id); if(!x) throw new Error('That extra brew no longer exists.');
          const wk=E().wkKey(E().saturdayOf(E().parseDate(iso)));
          if(ax.some(y=>y.id!==id&&(d=>d&&E().wkKey(E().saturdayOf(d))===wk)(E().parseDate(y.date)))) throw new Error('Another extra brew is already accepted that week (limit: one per week).');
          x.date=iso;},'Change extra brew date to '+iso+' (dashboard)','Extra brew moved to '+iso+'.'); } });
    box.addEventListener('click',e=>{
      const card=e.target.closest('.slot');
      if(e.target.closest('.s-accept')&&card){
        const sl=X.slots[+card.dataset.i], opt=sl.open[+card.querySelector('.s-date').value], pick=card.querySelector('input[type=radio]:checked');
        if(!pick) return; const beer=pick.value, iso=opt.iso, wk=E().wkKey(E().saturdayOf(opt.date));
        act(o=>{ const x=normX(o);
          if(x.accepted.some(y=>{const d=E().parseDate(y.date);return d&&E().wkKey(E().saturdayOf(d))===wk;})) throw new Error('Another extra brew is already accepted that week (limit: one per week).');
          x.accepted.push({id:'x'+Date.now().toString(36),tank:sl.tank,date:iso,beer}); },
          'Accept extra brew: '+beer+' in '+sl.tank+' on '+iso+' (dashboard)', 'Accepted: '+beer+' in '+sl.tank+' on '+dash(opt.date)+'.');
      } else if(e.target.closest('.s-decline')&&card){
        const sl=X.slots[+card.dataset.i];
        act(o=>{const x=normX(o); if(!x.declined.includes(sl.declineKey)) x.declined.push(sl.declineKey);},'Decline extra brew gap '+sl.declineKey+' (dashboard)','Gap hidden. Use "show again" to bring declined suggestions back.');
      } else if(e.target.closest('.a-remove')){
        const id=e.target.closest('.accrow').dataset.id;
        act(o=>{const x=normX(o); x.accepted=x.accepted.filter(y=>y.id!==id);},'Remove extra brew (dashboard)','Extra brew removed.');
      } else if(e.target.closest('.s-restore')){
        e.preventDefault(); act(o=>{normX(o).declined=[];},'Restore declined extra brew suggestions (dashboard)','Declined suggestions restored.');
      }
    });
    });
  }
  // ---- Schedule table: same columns, order and behaviour as the Scheduler's Schedule tab ----
  let sort={col:'date',dir:1},filter='';
  const WD=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],MO=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dash=d=>d?WD[d.getDay()]+'-'+MO[d.getMonth()]+'/'+String(d.getDate()).padStart(2,'0')+'/'+d.getFullYear():'—';
  const SC={'var(--blue2)':'#2c5aa0','var(--amber)':'#a05a0c','var(--gold2)':'#a05a0c','var(--hops)':'#2f7d4f','var(--muted)':'#8a7458','var(--green)':'#2f7d4f','var(--red2)':'#b3392e','#c47000':'#c47000','var(green)':'#2f7d4f'};
  function fillViewFrom(){
    const sel=$('sch-from'), prev=sel.value; sel.innerHTML='';
    for(let i=-8;i<52;i++){ const sat=E().addDays(E().saturdayOf(R.today),i*7); const o=document.createElement('option'); o.value=i; o.textContent=D(sat)+(i===0?' ← this week':''); sel.appendChild(o); }
    sel.value=prev!==''&&sel.querySelector('option[value="'+prev+'"]')?prev:'0';
  }
  function scheduleTable(){
    const start=parseInt($('sch-from').value)||0, wks=parseInt($('sch-show').value)||16;
    let rows=E().scheduleRows(start,wks);
    const q=filter.toLowerCase().trim();
    if(q) rows=rows.filter(r=>!r.b||(r._name.toLowerCase().includes(q)||String(r._batch).includes(q)||r._style.toLowerCase().includes(q)||r._tank.toLowerCase().includes(q)));
    const col=sort.col,dir=sort.dir; let out;
    if(col&&col!=='date'){
      const br=rows.filter(r=>r.type==='brew').sort((a,b)=>{let av=a['_'+col],bv=b['_'+col];if(col==='batch'||col==='seq'){av=Number(av)||0;bv=Number(bv)||0;}return av<bv?-dir:av>bv?dir:0;});
      let bi=0; out=rows.map(r=>r.type!=='brew'?r:br[bi++]);
    } else out=dir===1?rows:[...rows].reverse();
    const ar=c=>sort.col!==c?'<span class="ar">⇅</span>':'<span class="ar on">'+(sort.dir===1?'↑':'↓')+'</span>';
    const th=(c,l)=>`<th class="sortable" data-sort="${c}">${l}${ar(c)}</th>`;
    let h=`<thead><tr>${th('date','Brew Day')}${th('tank','Tank')}${th('batch','Batch#')}${th('name','Beer')}${th('seq','Seq#')}${th('style','Style')}<th>Cat</th>${th('kegDate','Scheduled Keg Date')}<th>Serve-Ready</th><th>Status</th></tr></thead><tbody>`;
    out.forEach(r=>{
      const now=r.isNow?'<span class="now">NOW</span>':'';
      if(r.type==='skip'){ h+=`<tr class="nb"><td class="mono nw">${dash(r.sat)}${now}</td><td colspan="9">⊘ Skipped — ${esc(r.skipReason)}</td></tr>`; return; }
      if(r.type==='nobrew'){ h+=`<tr class="nb ${r.isPast?'past':''}"><td class="mono nw">${dash(r.sat)}${now}</td><td colspan="9">${r.isPast?'No brew recorded':'No brew — all tanks busy'}</td></tr>`; return; }
      const b=r.b, fl=(b.manual?'<span class="fl man">MANUAL</span>':'')+(b.extra?'<span class="fl extra">EXTRA</span>':'');
      h+=`<tr class="${r.isPast?'past':''}${r.overridden?' ov':''}"><td class="mono nw">${dash(r.showDate)}${now}</td><td class="mono dim">${esc(b.tank||'')}</td><td class="bn">#${esc(b.batch)}</td>
        <td class="nm">${b.beer?esc(b.beer.name):'?'}${fl}</td><td class="mono dim">#${esc(b.seq)}</td><td>${b.beer?`<span class="pill">${esc(b.beer.style)}</span>`:''}</td>
        <td>${b.beer?`<span class="pill ${esc(b.beer.cat.replace(' ','-'))}">${esc(b.beer.cat)}</span>`:''}</td><td class="mono nw">${D(b.kegDate)}</td><td class="mono nw">${D(b.readyDate)}</td>
        <td class="mono" style="color:${SC[r.statusColor]||'#8a7458'}">${esc(r.statusLabel)}</td></tr>`;
    });
    return `<div class="tablewrap"><table>${h}</tbody></table></div>`;
  }
  function gapsHtml(){
    const min=E().GAP_DETAIL_MIN, g=R.gaps;
    return '<div class="gapgrid">'+g.tanks.map(t=>{
      const big=t.gaps.filter(x=>x.idle>=min);
      const items=big.map(x=>{
        const bl=x.blockers.length?`<div class="gm">Brewed elsewhere in this window: ${x.blockers.map(b=>esc(b.beer.name)+' ('+esc(b.tank||'?')+', '+D(b.brewDate)+')').join('; ')}</div>`:'';
        let sug='';
        if(x.declined) sug='<div class="gm">Extra brew suggestion declined in the Scheduler.</div>';
        else if(x.brewDate&&x.dayTaken) sug=`<div class="gm">${DW(x.brewDate)} already has a brew.</div>`;
        else if(x.brewDate&&x.fits.length) sug=`<div class="gm sug">Suggested extra brew ${DW(x.brewDate)} — fits: ${x.fits.slice(0,3).map(f=>esc(f.beer.name)+(f.offLane?' (off-lane)':'')).join(', ')}${x.fits.length>3?' +'+(x.fits.length-3)+' more':''}</div>`;
        return `<li><b>${D(x.from)} → ${D(x.to)}</b> · ${x.idle} d idle${x.emptyNow?' (empty now)':''} · before ${esc(x.beer.name)}${bl}${sug}</li>`;
      }).join('');
      const conf=t.conflict?`<div class="warn">Overlap: ${esc(t.conflict.beer.name)} is scheduled ${D(t.conflict.brewDate)}, ${t.conflict.overlapDays} d before this tank frees up.</div>`:'';
      return `<div class="gapcard"><h4>${t.name} <small>${t.totalIdle} idle days across ${t.gaps.length} gaps</small></h4>${conf}<ul>${items||'<li class="none">No gaps of '+min+'+ days.</li>'}</ul></div>`;
    }).join('')+'</div>';
  }
  function render(){
    const st=$('sch-status'), eng=E();
    const d=OCD.get();
    if(!d||!eng){st.className='sch-status err';st.textContent='Could not load schedule data'+(OCD.status.error?': '+OCD.status.error:'.');return;}
    try{ R=eng.build(d); }catch(e){ console.error(e); st.className='sch-status err'; st.textContent='Schedule engine error: '+e.message; return; }
    st.className='sch-status';
    st.textContent='Data saved '+(d.savedAt?new Date(d.savedAt).toLocaleString():'unknown')+(d.bfSyncTime?' · Brewfather synced '+new Date(d.bfSyncTime).toLocaleString():'')+' · read-only for now: edit in the Scheduler';
    X=eng.extraSlots(R);
    $('sch-tanks').innerHTML=tanksHtml(); $('sch-timeline').innerHTML=timelineHtml();
    $('sch-accepted').innerHTML=acceptedHtml(); $('sch-slots').innerHTML=slotsHtml(); fillViewFrom(); $('sch-table').innerHTML=scheduleTable(); $('sch-times').innerHTML='BF sync: <b>'+(d.bfSyncTime?new Date(d.bfSyncTime).toLocaleString():'not synced')+'</b> · Schedule built: <b>'+new Date().toLocaleString()+'</b>'; $('sch-gaps').innerHTML=gapsHtml();
  }
  function wire(){
    if(wired)return; wired=true;
    $('sch-prev').onclick=()=>{tlOffset-=4;if(R)$('sch-timeline').innerHTML=timelineHtml();};
    $('sch-next').onclick=()=>{tlOffset+=4;if(R)$('sch-timeline').innerHTML=timelineHtml();};
    wireSlots();
    const redraw=()=>{ if(R) $('sch-table').innerHTML=scheduleTable(); };
    $('sch-from').onchange=redraw; $('sch-show').onchange=redraw; $('sch-search').oninput=e=>{filter=e.target.value;redraw();};
    $('sch-table').addEventListener('click',e=>{const h=e.target.closest('[data-sort]');if(!h)return;const c=h.dataset.sort;if(sort.col===c)sort.dir*=-1;else{sort.col=c;sort.dir=1;}redraw();});
    $('sch-timeline').addEventListener('click',e=>{const c=e.target.closest('[data-slot]'); if(c){const el=$('sch-slot-'+c.dataset.slot); if(el){if(el.scrollIntoView) el.scrollIntoView({behavior:'smooth',block:'center'}); el.classList.add('hl'); setTimeout(()=>el.classList.remove('hl'),1800);}}});
    $('sch-today').onclick=()=>{tlOffset=0;if(R)$('sch-timeline').innerHTML=timelineHtml();};
  }
  return{
    mount(){ if(started)return; started=true; wire(); OCD.ready.then(render); },
    reload(){ if(started) OCD.reload().then(render); },
    refresh(){ if(started) render(); }
  };
})();
