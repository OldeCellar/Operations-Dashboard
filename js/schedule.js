(window.OCD_V=window.OCD_V||{})['schedule.js']='0.3.0';
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
        else h+='<div class="tle"></div>';
      });
      h+='</div>';
    });
    const used=new Set(); weeks.forEach(w=>(w.brews||[]).forEach(b=>b.beer&&used.add(b.beer.type||b.beer.style)));
    h+='<div class="legend">'+[...used].map(s=>`<span><i style="background:${E().STYLE_CLR[s]||'#6a6050'}"></i>${esc(s)}</span>`).join('')+'</div></div>';
    return h;
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
    $('sch-tanks').innerHTML=tanksHtml(); $('sch-timeline').innerHTML=timelineHtml();
    fillViewFrom(); $('sch-table').innerHTML=scheduleTable(); $('sch-times').innerHTML='BF sync: <b>'+(d.bfSyncTime?new Date(d.bfSyncTime).toLocaleString():'not synced')+'</b> · Schedule built: <b>'+new Date().toLocaleString()+'</b>'; $('sch-gaps').innerHTML=gapsHtml();
  }
  function wire(){
    if(wired)return; wired=true;
    $('sch-prev').onclick=()=>{tlOffset-=4;if(R)$('sch-timeline').innerHTML=timelineHtml();};
    $('sch-next').onclick=()=>{tlOffset+=4;if(R)$('sch-timeline').innerHTML=timelineHtml();};
    const redraw=()=>{ if(R) $('sch-table').innerHTML=scheduleTable(); };
    $('sch-from').onchange=redraw; $('sch-show').onchange=redraw; $('sch-search').oninput=e=>{filter=e.target.value;redraw();};
    $('sch-table').addEventListener('click',e=>{const h=e.target.closest('[data-sort]');if(!h)return;const c=h.dataset.sort;if(sort.col===c)sort.dir*=-1;else{sort.col=c;sort.dir=1;}redraw();});
    $('sch-today').onclick=()=>{tlOffset=0;if(R)$('sch-timeline').innerHTML=timelineHtml();};
  }
  return{
    mount(){ if(started)return; started=true; wire(); OCD.ready.then(render); },
    reload(){ if(started) OCD.reload().then(render); },
    refresh(){ if(started) render(); }
  };
})();
