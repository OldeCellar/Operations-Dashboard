(function(root, factory){
  if(typeof module === 'object' && module.exports) module.exports = factory();      // Node (GitHub Actions, tests)
  else { root.VolCalc = factory(); (root.OCD_V = root.OCD_V || {})['vol-calc.js'] = '0.3.0'; }   // browser
})(typeof self !== 'undefined' ? self : this, function(){
  /* ONE Vol On Hand calculation, shared by the dashboard and the weekly report/Action so they can never disagree.
     Rules (from the Weekly Vol On Hand Report):
       - batches: Brewfather status Completed with a Date Tapped; skip any with a Date Kicked.
       - anchor: the latest manual recount (Vol On Hand + Vol On Hand Date, on/after Date Tapped), else Bottling Volume at Date Tapped.
       - subtract request volume dated AFTER the anchor date through today (matched by beer name),
         subtract event drawdowns (events log) the same way,
         and subtract Vol To Kegerator when the anchor does not already exclude it.
       - Request dates may be m/d/yyyy or MMDDYYYY (the old report accepted only MMDDYYYY, which dropped every request). */
  const GROWLER_L = 1.95, SIXPACK_L = 6 * 0.345;
  const NAMES = { recount:'Vol On Hand', recountDate:'Vol On Hand Date', kegerator:'Vol To Kegerator', intoKegerator:'Date Into Kegerator' };
  const r2 = x => Math.round(x * 100) / 100;

  function findMeasuredNode(batch, targetName){
    const target = String(targetName).trim().toLowerCase(); let found = null; const seen = new Set();
    (function walk(node){
      if(found !== null || node === null || node === undefined || typeof node !== 'object' || seen.has(node)) return;
      seen.add(node);
      if(Array.isArray(node)){ for(const it of node){ walk(it); if(found !== null) return; } return; }
      const label = (typeof node.name === 'string' && node.name) || (typeof node.text === 'string' && node.text) || null;
      if(label && label.trim().toLowerCase() === target && 'value' in node && node.value !== '' && node.value !== null && node.value !== undefined){ found = node; return; }
      for(const k of Object.keys(node)){ walk(node[k]); if(found !== null) return; }
    })(batch);
    if(found === null && targetName in batch && batch[targetName] !== null && batch[targetName] !== undefined && batch[targetName] !== '') found = { value: batch[targetName] };
    return found;
  }
  const findMeasuredField = (b, n) => { const x = findMeasuredNode(b, n); return x ? x.value : null; };
  function parseCompactDigitDate(str){
    let m, d, y;
    if(str.length === 8){ m = str.slice(0,2); d = str.slice(2,4); y = str.slice(4,8); }
    else if(str.length === 7){ m = str.slice(0,1); d = str.slice(1,3); y = str.slice(3,7); } else return null;
    m = parseInt(m,10); d = parseInt(d,10); y = parseInt(y,10);
    if(!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31) || y < 2000 || y > 2100) return null;
    const dt = new Date(y, m - 1, d); return isNaN(dt.getTime()) ? null : dt;
  }
  function parseBFValue(v){
    if(v === null || v === undefined || v === '') return null;
    const s = String(v).trim();
    if(/^\d{7,8}$/.test(s)){ const c = parseCompactDigitDate(s); if(c) return c; }
    if(typeof v === 'number'){ const ms = v < 1e10 ? v * 1000 : v; const d = new Date(ms); return isNaN(d.getTime()) ? null : d; }
    if(typeof v === 'string'){ const n = Number(s);
      if(!isNaN(n) && s !== ''){ const ms = n < 1e10 ? n * 1000 : n; const d = new Date(ms); if(!isNaN(d.getTime())) return d; }
      const d2 = new Date(s); if(!isNaN(d2.getTime())) return d2; }
    return null;
  }
  const getRecipeName = b => (b.recipe && typeof b.recipe.name === 'string' && b.recipe.name.trim()) ? b.recipe.name : b.name;
  const normalizeBeerName = n => (n || 'Unnamed Beer').trim().replace(/\s+/g, ' ');
  const toCompact = d => `${d.getMonth() + 1}${String(d.getDate()).padStart(2,'0')}${d.getFullYear()}`;
  const num = v => (typeof v === 'number') ? v : (v ? Number(v) : null);
  const batchKey = (b, name, tapped) => b._id || (b.batchNo != null ? 'batchno-' + b.batchNo : name + '-' + tapped.getTime());
  const day0 = d => { const x = new Date(d); x.setHours(0,0,0,0); return x; };

  function parseRequestMDY(str){          // accepts 10/15/2026, 10-15-26 and 10152026
    if(!str) return null; const v = String(str).trim();
    if(/^\d{8}$/.test(v)){ const m = +v.slice(0,2), d = +v.slice(2,4), y = +v.slice(4,8), dt = new Date(y, m-1, d);
      return (dt.getFullYear() === y && dt.getMonth() === m-1 && dt.getDate() === d) ? dt : null; }
    const p = v.split(/[\/\-]/); if(p.length !== 3) return null;
    let [m, d, y] = p.map(s => parseInt(s, 10)); if(!m || !d || !y) return null; if(y < 100) y += 2000;
    const dt = new Date(y, m-1, d); return isNaN(dt.getTime()) ? null : dt;
  }
  function parseCSV(text){
    const rows = []; let row = [], f = '', q = false;
    for(let i = 0; i < text.length; i++){ const c = text[i];
      if(q){ if(c === '"'){ if(text[i+1] === '"'){ f += '"'; i++; } else q = false; } else f += c; }
      else if(c === '"') q = true; else if(c === ','){ row.push(f); f = ''; }
      else if(c === '\n'){ row.push(f); rows.push(row); row = []; f = ''; } else if(c === '\r'){} else f += c; }
    if(f.length || row.length){ row.push(f); rows.push(row); }
    return rows;
  }
  function requestRowsFromCSV(text){       // columns: beer, growlers, six-packs, date  (the public Request View)
    const t = parseCSV(text); if(!t.length) return [];
    let start = 0; if(t[0][3] !== undefined && parseRequestMDY(t[0][3]) === null) start = 1;
    const out = [];
    for(let i = start; i < t.length; i++){ const r = t[i]; if(!r || r.length < 4) continue;
      const beer = (r[0] || '').trim(), g = parseInt(r[1],10) || 0, s = parseInt(r[2],10) || 0, dt = parseRequestMDY(r[3]);
      if(!beer || !dt) continue; out.push({ beer, growlers:g, sixpacks:s, date:dt, volume: g * GROWLER_L + s * SIXPACK_L }); }
    return out;
  }
  const parseEventDate = s => { if(s instanceof Date) return s; const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2]-1, +m[3]) : parseRequestMDY(s); };

  function compute(opts){
    const batches = opts.batches || [], requestRows = opts.requestRows || [], events = opts.events || [], now = opts.now || new Date();
    const tappedField = opts.tappedField || 'Date Tapped', kickedField = opts.kickedField || 'Date Kicked';
    const evRows = events.map(e => ({ beer:e.beer, date:parseEventDate(e.date), volume:Number(e.volumeL) || 0 })).filter(e => e.date && e.volume > 0);
    const results = [], sevenAgo = new Date(now); sevenAgo.setDate(sevenAgo.getDate() - 7);
    for(const b of batches){
      if(b.status && b.status !== 'Completed') continue;
      const tappedDate = parseBFValue(findMeasuredField(b, tappedField)); if(!tappedDate) continue;
      const kickedDate = parseBFValue(findMeasuredField(b, kickedField));
      const name = normalizeBeerName(getRecipeName(b)), key = name.toLowerCase();
      const volKegged = (typeof b.measuredBottlingSize === 'number') ? b.measuredBottlingSize : null;
      const base = { name, batchNumber: b.batchNo || b.batchNumber || null, batchId: batchKey(b, name, tappedDate), tappedDate, volKegged };
      if(kickedDate){ results.push(Object.assign(base, { kickedInBF:true, kickedDate, remaining:0, hasVolData:volKegged !== null })); continue; }

      const mv = num(findMeasuredField(b, NAMES.recount)), md = parseBFValue(findMeasuredField(b, NAMES.recountDate));
      let anchorDate = tappedDate, anchorVolume = volKegged, anchorIsManual = false;
      if(md && mv !== null && !isNaN(mv) && md >= tappedDate){ anchorDate = md; anchorVolume = mv; anchorIsManual = true; }

      const kegL = Math.max(0, num(findMeasuredField(b, NAMES.kegerator)) || 0);
      const into = parseBFValue(findMeasuredField(b, NAMES.intoKegerator));
      // A recount taken AFTER the keg moved already excludes it; a Bottling Volume anchor (or an older recount) does not.
      const kegApplied = kegL > 0 && (!anchorIsManual || (into && day0(into) > day0(anchorDate)));

      const inWin = (r, from) => r.date > from && r.date <= now && normalizeBeerName(r.beer).toLowerCase() === key;
      const rq = requestRows.filter(r => inWin(r, anchorDate)), ev = evRows.filter(r => inWin(r, anchorDate));
      const sum = a => a.reduce((s, r) => s + r.volume, 0);
      const drawnReq = sum(rq), drawnEv = sum(ev);
      const remaining = anchorVolume !== null ? r2(anchorVolume - drawnReq - drawnEv - (kegApplied ? kegL : 0)) : null;
      results.push(Object.assign(base, { kickedInBF:false, kickedDate:null, anchorDate, anchorVolume, anchorIsManual,
        requestsL:r2(drawnReq), requestCount:rq.length, eventsL:r2(drawnEv), eventCount:ev.length, kegeratorL:kegL, kegeratorApplied:!!kegApplied,
        remaining, litersThisWeek:r2(sum(requestRows.filter(r => inWin(r, sevenAgo)))), eventLitersThisWeek:r2(sum(evRows.filter(r => inWin(r, sevenAgo)))),
        kicked: remaining !== null && remaining <= 0, hasVolData: anchorVolume !== null }));
    }
    return results;
  }
  // one row per beer name (the Request app sums duplicate names), un-kicked batches only
  function totalsByBeer(results){
    const m = new Map();
    results.filter(r => !r.kickedInBF && r.remaining !== null).forEach(r => {
      const o = m.get(r.name) || { name:r.name, volume:0, batches:[], withVolume:[] }; o.volume = r2(o.volume + Math.max(r.remaining, 0));
      if(r.batchNumber !== null && r.batchNumber !== undefined){ o.batches.push(r.batchNumber); if(r.remaining > 0) o.withVolume.push(r.batchNumber); } m.set(r.name, o); });
    // batch numbers that still hold beer (all of them if none do)
    return [...m.values()].map(o => ({ name:o.name, volume:o.volume, batches:(o.withVolume.length ? o.withVolume : o.batches) }));
  }
  // Manual items (not in Brewfather, e.g. seltzers): a volume entered on a date, drawn down by requests and events after that date.
  function computeManual(items, requestRows, events, now){
    now = now || new Date();
    const evRows = (events || []).map(e => ({ beer:e.beer, date:parseEventDate(e.date), volume:Number(e.volumeL) || 0 })).filter(e => e.date && e.volume > 0);
    return (items || []).filter(i => i && i.name).map(i => {
      const anchorDate = parseEventDate(i.date) || day0(now), key = normalizeBeerName(i.name).toLowerCase(), vol = Number(i.vol) || 0;
      const inWin = r => r.date > anchorDate && r.date <= now && normalizeBeerName(r.beer).toLowerCase() === key;
      const rq = (requestRows || []).filter(inWin), ev = evRows.filter(inWin), sum = a => a.reduce((s, r) => s + r.volume, 0);
      return { id:i.id, name:normalizeBeerName(i.name), manual:true, anchorVolume:vol, anchorDate, requestsL:r2(sum(rq)), requestCount:rq.length,
               eventsL:r2(sum(ev)), eventCount:ev.length, remaining:r2(vol - sum(rq) - sum(ev)) };
    });
  }
  // What the Bellvale Settings sheet should receive: one row per beer name (H/I/J) and the offered list (E).
  function sheetPlan(o){
    const now = o.now || new Date(), offered = new Set((o.offered || []).map(n => normalizeBeerName(n).toLowerCase()));
    const bf = totalsByBeer(o.volResults || []).map(t => ({ name:t.name, volume:t.volume, source:'brewfather', batches:t.batches }));
    const man = computeManual(o.manualItems, o.requestRows, o.events, now).map(m => ({ name:m.name, volume:Math.max(m.remaining, 0), source:'manual', batches:[] }));
    const seen = new Set(), beers = [];
    bf.concat(man).forEach(b => { const k = b.name.toLowerCase(); if(seen.has(k)) return; seen.add(k); beers.push(Object.assign(b, { offered: offered.has(k) })); });
    beers.sort((a, b) => a.name.localeCompare(b.name));
    const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0');
    return { inventoryDate: y + '-' + m + '-' + d, beers, offered: beers.filter(b => b.offered).map(b => b.name) };
  }
  return { compute, computeManual, sheetPlan, totalsByBeer, requestRowsFromCSV, parseRequestMDY, parseBFValue, findMeasuredField, normalizeBeerName, toCompact, GROWLER_L, SIXPACK_L };
});
