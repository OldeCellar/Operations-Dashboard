(function(root, factory){
  if(typeof module === 'object' && module.exports) module.exports = factory();
  else { root.DemandCalc = factory(); (root.OCD_V = root.OCD_V || {})['demand-calc.js'] = '0.4.0'; }
})(typeof self !== 'undefined' ? self : this, function(){
  /* Ingredient demand from planned brews, ported from the Scheduler's "Demand by Period" (matching rules), plus order quantities:
       need = recipe amounts of every planned brew inside the look-ahead window
       to order = max(0, minStock - (onHand - need))        (so stock never drops below the minimum after the brews)
     Units: everything is converted into the Brewfather inventory item's unit (kg, g, ml, pkg ...). */
  const norm = s => (s || '').toString().toLowerCase().trim().replace(/\s+/g, ' ');
  const normForm = s => { const x = norm(s); if(!x) return ''; if(/pellet|t-?90|t-?45/.test(x)) return 'pellet'; if(/whole|leaf|cone/.test(x)) return 'whole'; if(/plug/.test(x)) return 'plug'; if(/co2|extract|cryo|oil/.test(x)) return 'extract'; return x; };
  const formLabel = s => ({ pellet:'Pellet', whole:'Whole', plug:'Plug', extract:'CO2 extract' }[normForm(s)] || (s || ''));
  const stripYear = s => norm(s).replace(/\s+20\d{2}\s*$/, '').trim();
  const MASS = { mg:0.001, g:1, kg:1000, oz:28.349523125, lb:453.59237, lbs:453.59237 };
  const VOL  = { ml:1, l:1000, tsp:4.92892159375, tbsp:14.78676478125, floz:29.5735295625, gal:3785.411784 };
  const COUNT = { pkg:1, items:1, item:1, each:1, pk:1 };
  function convert(amount, from, to){
    from = norm(from); to = norm(to); if(from === to) return amount;
    for(const t of [MASS, VOL, COUNT]) if(from in t && to in t) return amount * t[from] / t[to];
    return null;
  }
  const defaultUnit = type => ({ Fermentable:'kg', Hop:'g', Yeast:'pkg', Misc:'g' }[type] || 'g');

  function matchInventory(ing, type, inventory){
    const raw = ing.name || '?', code = norm(raw);
    const ofType = inventory.filter(i => i.type === type);
    if(type === 'Hop'){
      const f = normForm(ing.type), c = stripYear(raw), same = ofType.filter(i => stripYear(i.name) === c);
      const byStock = l => l.slice().sort((x, y) => (Number(y.onHand) || 0) - (Number(x.onHand) || 0));
      return byStock(same.filter(i => !f || normForm(i.bf_type) === f))[0] || byStock(same)[0] || null;
    }
    if(type === 'Yeast'){
      const lab = norm(ing.laboratory), pid = norm(ing.productId);
      const cand = ofType.filter(i => norm(i.bf_productId) === code || (pid && norm(i.bf_productId) === pid) || norm(i.name) === code);
      return cand.find(i => !lab || !i.bf_laboratory || norm(i.bf_laboratory) === lab) || cand[0] || null;
    }
    return ofType.find(i => norm(i.name) === code) || ofType.find(i => norm(i.name).startsWith(code) || code.startsWith(norm(i.name))) || null;
  }


  // Brewfather can hold several inventory items for one ingredient (two suppliers, crop years). Group them so on-hand adds up and
  // demand is compared against the total. Negative counts are treated as 0; ids listed in a catalog item's bfIgnore are left out.
  function groupInventory(inventory, catalogItems){
    const ignore = new Set(); (catalogItems || []).forEach(i => (i.bfIgnore || []).forEach(x => ignore.add(x)));
    const keyOf = i => i.type === 'Hop' ? 'Hop|' + stripYear(i.name) + '|' + normForm(i.bf_type)
                     : i.type === 'Yeast' ? 'Yeast|' + norm(i.bf_productId || i.name) + '|' + norm(i.bf_laboratory)
                     : i.type + '|' + norm(i.name);
    const groups = new Map();
    inventory.forEach(i => { const k = keyOf(i); if(!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
    const virtual = [], groupOf = new Map(), members = new Map();
    groups.forEach(ms => {
      const counted = ms.filter(m => !ignore.has(m.bf_id));
      const primary = (counted.slice().sort((a, b) => (Number(b.onHand) || 0) - (Number(a.onHand) || 0))[0]) || ms[0];
      const total = counted.reduce((s, m) => s + Math.max(0, Number(m.onHand) || 0), 0);
      const sup = [...new Set((counted.some(m => (Number(m.onHand) || 0) > 0) ? counted.filter(m => (Number(m.onHand) || 0) > 0) : ms).map(m => m.bf_supplier).filter(Boolean))].join(' / ');
      const v = Object.assign({}, primary, { onHand: total, bf_supplier: sup, members: ms, label: primary.type === 'Hop' && primary.bf_type ? primary.name + ' (' + formLabel(primary.bf_type) + ')' : primary.name });
      virtual.push(v); members.set(primary.bf_id, ms); ms.forEach(m => groupOf.set(m.bf_id, primary.bf_id));
    });
    return { virtual, groupOf, members };
  }

  // brews: [{batch, name, date}], recipes: lookup(brew) -> recipe object or null
  function computeDemand(brews, getRecipe, inventory){
    const rows = new Map(); let uncached = 0;
    const add = (ing, type, brew) => {
      const inv = matchInventory(ing, type, inventory);
      const key = inv ? inv.bf_id : 'x|' + type + '|' + norm(ing.name);
      const unit = inv ? (inv.unit || defaultUnit(type)) : (ing.unit || defaultUnit(type));
      const rawUnit = ing.unit || defaultUnit(type);
      let amt = Number(ing.amount) || 0, conv = convert(amt, rawUnit, unit), unitMismatch = false;
      if(conv === null){ conv = amt; unitMismatch = true; }
      let r = rows.get(key);
      if(!r){ r = { key, bfId: inv ? inv.bf_id : null, name: inv ? (inv.label || inv.name) : (ing.name || '?'), type, unit, matched: !!inv, onHand: inv ? Number(inv.onHand) || 0 : null, total: 0, refs: [], unitMismatch: false }; rows.set(key, r); }
      r.total += conv; r.unitMismatch = r.unitMismatch || unitMismatch;
      r.refs.push({ batch: brew.batch, beer: brew.name, date: brew.date, amount: conv, rawAmount: amt, rawUnit });
    };
    brews.forEach(b => {
      const rec = getRecipe(b); if(!rec){ uncached++; return; }
      const R = rec.recipe || rec;
      (R.fermentables || []).forEach(x => add(x, 'Fermentable', b));
      (R.hops || []).forEach(x => add(x, 'Hop', b));
      (R.yeasts || []).forEach(x => add(x, 'Yeast', b));
      (R.miscs || []).forEach(x => add(x, 'Misc', b));
    });
    return { rows: [...rows.values()], uncached };
  }

  // join demand with catalog items (min stock, offers) and compute what to order
  function shortfalls(demandRows, inventory, catalogItems, groupOf){
    const gid = id => (groupOf && groupOf.get(id)) || id;
    const byBf = new Map((catalogItems || []).filter(i => i.bfId).map(i => [gid(i.bfId), i]));
    const seen = new Set(), out = [];
    const mk = (r, inv) => {
      const it = byBf.get(r.bfId), min = it && it.minStock != null ? Number(it.minStock) : null;
      const onHand = r.onHand != null ? r.onHand : 0, need = r.total || 0;
      const target = min != null ? min : 0;
      const projected = onHand - need;
      const noRestock = !!(it && it.restock === false);
      const order = noRestock ? 0 : Math.max(0, target - projected);
      return Object.assign({}, r, { catalogItem: it || null, minStock: min, projected, order, noRestock });
    };
    demandRows.forEach(r => { out.push(mk(r)); if(r.bfId) seen.add(r.bfId); });
    // items with a minimum but no demand in the window
    (catalogItems || []).forEach(it => {
      if(!it.bfId || seen.has(gid(it.bfId)) || it.minStock == null || it.restock === false) return;
      const inv = inventory.find(i => i.bf_id === gid(it.bfId)); if(!inv) return;
      out.push(mk({ key: inv.bf_id, bfId: inv.bf_id, name: inv.label || inv.name, type: inv.type, unit: inv.unit || defaultUnit(inv.type), matched: true, onHand: Number(inv.onHand) || 0, total: 0, refs: [], unitMismatch: false }));
    });
    return out;
  }

  // vendor pack -> item unit; returns {perPack, packs, cost}
  function packQuantity(offer, itemUnit, units, shortfall){
    const u = units && units[offer.unit]; if(!u || !offer.packSize) return null;
    const metricUnit = u.to === 'Liters' ? 'l' : u.to === 'gram' ? 'g' : u.to;       // settings.json names
    const perPack = convert(offer.packSize * u.factor, metricUnit, itemUnit);
    if(perPack === null || !(perPack > 0)) return null;
    const packs = Math.ceil(shortfall / perPack - 1e-9);
    return { perPack, packs, cost: offer.lastPrice != null ? packs * offer.lastPrice : null };
  }

  // settings.json units: { lbs:{to:'kg',factor:0.4536}, gal:{to:'Liters',...}, ... }  ->  amounts in the item's own unit
  const metricName = t => (t === 'Liters' ? 'l' : t === 'gram' ? 'g' : t);
  function fromVendorUnit(value, vendorUnit, itemUnit, units){      // e.g. 55 lbs -> kg
    const u = units && units[vendorUnit]; if(!u) return convert(value, vendorUnit, itemUnit);
    return convert(value * u.factor, metricName(u.to), itemUnit);
  }
  function toVendorUnit(value, itemUnit, vendorUnit, units){        // e.g. 24.9 kg -> lbs
    const u = units && units[vendorUnit]; if(!u) return convert(value, itemUnit, vendorUnit);
    const m = convert(value, itemUnit, metricName(u.to)); return m === null ? null : m / u.factor;
  }
  // per ingredient (inventory item): how many recipes use it, the largest single-brew amount and which recipe
  function recipeUsage(recipesByName, inventory){
    const out = {};
    Object.values(recipesByName || {}).forEach(rec => {
      const R = rec.recipe || rec, per = {};
      [['fermentables','Fermentable'],['hops','Hop'],['yeasts','Yeast'],['miscs','Misc']].forEach(([k,type]) => (R[k] || []).forEach(ing => {
        const inv = matchInventory(ing, type, inventory); if(!inv) return;
        const unit = inv.unit || defaultUnit(type), raw = ing.unit || defaultUnit(type); let a = convert(Number(ing.amount) || 0, raw, unit); if(a === null) a = Number(ing.amount) || 0;
        per[inv.bf_id] = (per[inv.bf_id] || 0) + a; }));
      Object.entries(per).forEach(([id, amt]) => { const o = out[id] || (out[id] = { count: 0, max: 0, maxRecipe: null, list: [] });
        o.count++; o.list.push({ recipe: rec.name || R.name, amount: amt }); if(amt > o.max){ o.max = amt; o.maxRecipe = rec.name || R.name; } });
    });
    Object.values(out).forEach(o => o.list.sort((a, b) => b.amount - a.amount));
    return out;
  }
  return { normForm, formLabel, stripYear, groupInventory, computeDemand, shortfalls, packQuantity, matchInventory, convert, norm, fromVendorUnit, toVendorUnit, recipeUsage };
});
