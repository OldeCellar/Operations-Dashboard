(window.OCD_V=window.OCD_V||{})['schedule.js']='0.2.0';
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
  function upcomingHtml(){
    const rows=[];
    R.upcoming.forEach(w=>{
      if(w.skipped){rows.push(`<tr class="skip"><td>${DW(w.sat)}</td><td colspan="7">No brew — ${esc(w.skipReason||'skipped')}</td></tr>`);return;}
      (w.brews||[]).forEach(b=>{
        if(!b.beer) return;
        const fl=[b.extra?'<span class="fl extra">Extra</span>':'',b.seasonal?'<span class="fl seas">Seasonal</span>':'',b.manual?'<span class="fl man">Manual</span>':''].join('');
        rows.push(`<tr><td>${DW(b.brewDate||w.sat)}</td><td class="mono">${esc(b.tank||'—')}</td>
          <td class="nm"><i style="background:${E().clr(b.beer)}"></i>${esc(b.beer.name)} ${fl}</td>
          <td class="n">${b.seq||'—'}</td><td class="n">${esc(b.batch||'—')}</td><td>${D(b.kegDate)}</td><td>${D(b.readyDate)}</td><td class="note">${esc(b.notes||'')}</td></tr>`);
      });
    });
    return `<div class="tablewrap"><table><thead><tr><th>Brew date</th><th>Tank</th><th>Beer</th><th class="n">Brew #</th><th class="n">Batch #</th><th>Keg</th><th>Ready</th><th>Notes</th></tr></thead><tbody>${rows.join('')||'<tr><td colspan="8" class="empty">Nothing scheduled.</td></tr>'}</tbody></table></div>`;
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
    st.textContent='Built '+new Date().toLocaleTimeString()+' from data saved '+(d.savedAt?new Date(d.savedAt).toLocaleString():'unknown')+(d.bfSyncTime?' · Brewfather synced '+new Date(d.bfSyncTime).toLocaleString():'')+' · read-only: edit in the Scheduler for now';
    $('sch-tanks').innerHTML=tanksHtml(); $('sch-timeline').innerHTML=timelineHtml();
    $('sch-upcoming').innerHTML=upcomingHtml(); $('sch-gaps').innerHTML=gapsHtml();
  }
  function wire(){
    if(wired)return; wired=true;
    $('sch-prev').onclick=()=>{tlOffset-=4;if(R)$('sch-timeline').innerHTML=timelineHtml();};
    $('sch-next').onclick=()=>{tlOffset+=4;if(R)$('sch-timeline').innerHTML=timelineHtml();};
    $('sch-today').onclick=()=>{tlOffset=0;if(R)$('sch-timeline').innerHTML=timelineHtml();};
  }
  return{
    mount(){ if(started)return; started=true; wire(); OCD.ready.then(render); },
    reload(){ if(started) OCD.reload().then(render); },
    refresh(){ if(started) render(); }
  };
})();
