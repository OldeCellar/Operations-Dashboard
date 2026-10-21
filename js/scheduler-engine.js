(window.OCD_V=window.OCD_V||{})['scheduler-engine.js']='0.2.0';
/* Scheduling engine: the Scheduler v33.28 code, extracted VERBATIM (only change: `const TODAY` -> `let TODAY` so it refreshes each build),
   plus a small wrapper at the bottom. State comes from brewery_data.json instead of localStorage. */
window.SchedulerEngine=(()=>{
let BEERS = [], BREW_HISTORY = [], OVERRIDES = {}, KEG_SETTINGS = {}, USAGE_LOG = [], BF_CREDS = {userId:'',apiKey:''};

let SCHEDULE = [], _nextBatchId = 553, _dirty = false;

let EXTRA_BREWS = { dow:1, accepted:[], declined:[] };

let TODAY = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();

function addDays(d,n){ if(!d) return null; const r=new Date(d); r.setDate(r.getDate()+n); return r; }

function parseDate(s){ if(!s||typeof s!=='string'||!s.includes('-')) return null; const [y,m,d]=s.split('-').map(Number); if(!y) return null; return new Date(y,m-1,d); }

function fmtFull(d){ if(!d||isNaN(new Date(d).getTime())) return '—'; return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'}); }

function fmtISO(d){ if(!d) return ''; return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

function saturdayOf(d){ if(!d) return null; const r=new Date(d); if(isNaN(r.getTime())) return null; const day=r.getDay(); r.setDate(r.getDate()+(day===6?0:6-day)); r.setHours(0,0,0,0); return r; }

function wkKey(sat){ return sat ? fmtISO(sat) : ''; }

function isExtraHistory(h){
  if(!h || !h.date) return false;
  const d = parseDate(h.date); if(!d) return false;
  const iso = fmtISO(d), nm = (h.name || '').toLowerCase();
  return (EXTRA_BREWS.accepted || []).some(x => x.date === iso && (x.beer || '').toLowerCase() === nm);
}

function extraMatchesHistory(x){
  return BREW_HISTORY.some(h => h.date && parseDate(h.date) && fmtISO(parseDate(h.date)) === x.date
                             && (h.name || '').toLowerCase() === (x.beer || '').toLowerCase());
}

function getExtraWeekKeys(){
  const k = new Set();
  BREW_HISTORY.forEach(h => { if(isExtraHistory(h)) k.add(wkKey(saturdayOf(parseDate(h.date)))); });
  return k;
}

function calcKegDate(bfBottlingDate, brewDate, tankDays, allKegDates) {
  // Rule 1: BF date wins unconditionally
  if (bfBottlingDate) return new Date(bfBottlingDate);

  // Rule 2: brewDate + tankDays, rounded back to Wednesday
  const raw = addDays(brewDate, tankDays);
  if (!raw) return null;
  const dow = raw.getDay(); // 0=Sun,1=Mon,...,3=Wed,6=Sat
  const daysToWed = dow >= 3 ? dow - 3 : dow + 4; // days to roll back to Wed
  const wed = addDays(raw, -daysToWed);

  // Rule 3: collision — if another batch already has this Wednesday, bump to Tuesday
  if (allKegDates && allKegDates.some(d => d && fmtISO(d) === fmtISO(wed))) {
    return addDays(wed, -1); // Tuesday
  }
  return wed;
}

function rebuildSchedule() {
  // Seed sequence counters from actual brew history + beer seqStart setting
  const seqCounter = {};
  BREW_HISTORY.forEach(h => {
    seqCounter[h.name] = Math.max(seqCounter[h.name] || 0, h.seq || 0);
  });

  // Apply seqStart floor: if beer's first BF batch is brew #41, and history only shows
  // seq 41-43, the counter is already correct. If history is empty or starts below
  // seqStart, bump the counter to seqStart-1 so the next brew gets seqStart.
  BEERS.forEach(beer => {
    if (beer.seqStart && beer.seqStart > 1) {
      const floor = beer.seqStart - 1;
      if ((seqCounter[beer.name] || 0) < floor) {
        seqCounter[beer.name] = floor;
        console.log(
          'seqStart floor applied: ' + beer.name +
          ' counter set to ' + floor +
          ' (next brew = #' + beer.seqStart + ')'
        );
      }
    }
  });

  let nextBatch = Math.max(...BREW_HISTORY.map(h => h.batch || 0), 552) + 1;

// ── LANE-BASED TANK MODEL ──────────────────────────────────────────────────
// Tank 01 = IPA rotation only
// Tank 02 = Lager rotation only
// Tank 03 = Seasonals, Kolsch, and fillers
// ──────────────────────────────────────────────────────────────────────────
const T01 = { name: 'Tank 01', free: new Date(0), beerType: null, lane: 'ipa' };
const T02 = { name: 'Tank 02', free: new Date(0), beerType: null, lane: 'lager' };
const T03 = { name: 'Tank 03', free: new Date(0), beerType: null, lane: 'flex' };
const tanks = [T01, T02, T03];

function isFree(tank, sat) {
  // Tank kegged on Wednesday is free by Saturday — use <=
  // A tank with no free date (never used) is always free
  return !tank.free || tank.free <= sat;
}

function getRotationIdx(list) {
  if (!list.length) return 0;
  const last = [...BREW_HISTORY].reverse().find(h => list.some(b => b.name === h.name));
  if (!last) return 0;
  const idx = list.findIndex(b => b.name === last.name);
  return idx < 0 ? 0 : (idx + 1) % list.length;
}

function assignTank(tank, beer, sat, allKegDates) {
  const kd = calcKegDate(null, sat, beer.t, allKegDates || []);
  tank.free = kd;
  tank.beerType = beer.type;
  seqCounter[beer.name] = (seqCounter[beer.name] || 0) + 1;
  if (allKegDates) allKegDates.push(kd);
  return {
    beer,
    tank: tank.name,
    brewDate: sat,
    kegDate: kd,
    readyDate: addDays(sat, beer.total),
    batch: nextBatch++,
    seq: seqCounter[beer.name],
    notes: '',
    manual: false,
    lane: tank.lane
  };
}

// Replay history to set tank free-dates from actual recorded brews
// Only include past brews (date <= today) and valid tanks — exclude future
// planned entries and Tank 00 which would push free-dates years forward
const VALID_TANKS = new Set(['Tank 01', 'Tank 02', 'Tank 03']);
// Active BF statuses — brews in these states physically occupy a tank
const BF_ACTIVE = new Set(['Planning','Brewing','Fermenting','Conditioning']);

const sortedHist = [...BREW_HISTORY]
  .filter(h => {
    if (!h.date) return false;
    const d = parseDate(h.date);
    if (!d) return false;
    if (h.tank && !VALID_TANKS.has(h.tank)) return false;
    // Include past brews always
    if (d <= TODAY) return true;
    // Include NEAR-FUTURE brews (within 14 days) that BF confirms are active
    // These are physically committed — they've been pitched or are planned
    const daysAhead = (d - TODAY) / 86400000;
    if (daysAhead <= 14 && h.bfStatus && BF_ACTIVE.has(h.bfStatus)) return true;
    return false;
  })
  .sort((a, b) => parseDate(a.date) - parseDate(b.date));

// Sentinel used when BF's live status says a batch is still physically
// fermenting/brewing past its calculated/estimated keg date — pushes the
// tank's free date far enough out that the auto-scheduler won't offer it
// until the next BF sync reports a real status change or keg date.
const FAR_FUTURE = new Date(2099, 0, 1);

sortedHist.forEach(h => {
  const beer = (h.beerId != null)
    ? (BEERS.find(b => b.id === h.beerId) || beerByName(h.name))
    : beerByName(h.name);
  if (!beer) return;

  const brewDate = parseDate(h.date);
  const kegDate = h.kegDate ? parseDate(h.kegDate) : calcKegDate(null, brewDate, beer.t, []);
  if (!kegDate) return;

  // BF's live status is the ultimate source of truth for whether a batch is
  // still physically occupying a tank. Our calculated/estimated keg date is
  // just a planning estimate — if fermentation runs long or kegging gets
  // delayed in real life, BF still says Brewing/Fermenting even after that
  // estimated date has passed. In that case the tank stays occupied on
  // paper too, instead of freeing up early and letting the scheduler
  // double-book it.
  const stillPhysicallyInTank = kegDate <= TODAY && isInTank(h);
  const effectiveFree = stillPhysicallyInTank ? FAR_FUTURE : kegDate;

  // Always update the tank that was actually recorded for this brew.
  // The old code only updated a tank if it was "free" on brew day, which
  // silently dropped overlapping brews and left tanks with stale free dates.
  // Now: if the history entry names a tank, update that tank unconditionally.
  // If no tank name recorded, fall back to the beer's lane tank.
  const named = tanks.find(t => t.name === h.tank);
  const laneTank = beer.lane === 'ipa' ? T01 : beer.lane === 'lager' ? T02 : T03;
  const targetTank = named || laneTank;

  // Only advance the free date — never move it backward.
  // This ensures the latest brew in a tank always wins.
  if (effectiveFree > targetTank.free) {
    // Warn if any entry pushes a tank's free date more than 60 days out
    const sixtyDays = addDays(TODAY, 60);
    if (effectiveFree > sixtyDays) {
      console.warn('[TANK REPLAY] Batch #' + h.batch + ' "' + h.name + '"' +
        ' brew=' + h.date + ' keg=' + (h.kegDate||'(calc '+fmtISO(kegDate)+')') +
        ' bfStatus=' + (h.bfStatus||'-') +
        ' stillInTank=' + stillPhysicallyInTank +
        ' → sets ' + targetTank.name + '.free=' + fmtISO(effectiveFree));
    }
    targetTank.free = effectiveFree;
    targetTank.beerType = beer.type;
  }
});

// Log final tank free dates so we can see what set them
console.log('[TANK REPLAY] Final free dates — T01:', fmtISO(T01.free), 'T02:', fmtISO(T02.free), 'T03:', fmtISO(T03.free));


function parseTargetMD(target) {
  if (!target) return null;
  if (Array.isArray(target) && target.length >= 2) {
    const mm = parseInt(target[0], 10);
    const dd = parseInt(target[1], 10);
    return (mm && dd) ? [mm, dd] : null;
  }
  const s = String(target).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    const mm = parseInt(m[1], 10);
    const dd = parseInt(m[2], 10);
    return (mm && dd) ? [mm, dd] : null;
  }
  return null;
}

function makeLocalServeDate(year, target) {
  const md = parseTargetMD(target);
  if (!md) return null;
  const [mm, dd] = md;
  return new Date(year, mm - 1, dd, 12, 0, 0, 0);
}

function saturdayOnOrBefore(d) {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  const day = x.getDay();
  const back = (day === 6) ? 0 : day + 1;
  x.setDate(x.getDate() - back);
  x.setHours(12, 0, 0, 0);
  return x;
}

function seasonalBrewSaturday(target, tankDays, matDays, year) {
  const serveDate = makeLocalServeDate(year, target);
  if (!serveDate) return null;
  const totalDays = Number(tankDays || 0) + Number(matDays || 0);
  const brewDate = addDays(serveDate, -totalDays);
  return saturdayOnOrBefore(brewDate);
}

function sameLocalDate(a, b) {
  return a && b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

const startSat = saturdayOf(TODAY);
const WEEKS = 60;
SCHEDULE = [];

// ════════════════════════════════════════════════════════
// THREE-PASS SCHEDULE BUILD
// ════════════════════════════════════════════════════════
// NEW SCHEDULER
//
// Priority:
//
// 1. Manual overrides
// 2. Seasonals
// 3. Kolsch
// 4. IPA core brands
// 5. Lager core brands
// 6. Fillers
//
// ONE BREW PER SATURDAY MAXIMUM
// ════════════════════════════════════════════════════════

// Build a set of Saturdays already occupied by a recorded history brew —
// these weeks must not get a second brew scheduled into a different tank.
// Any Saturday with a real, dated batch in BREW_HISTORY is taken — no matter
// how far in the future. (A 14-day cutoff used to leave far-future Brewfather
// "Planning" batches unprotected, so Pass 4 scheduled phantom duplicate brews
// on top of them. Those never showed on screen — pastByKey always prefers the
// real entry — but they still consumed batch numbers during renumbering,
// causing numbers to jump ahead.)
const historyOccupiedSaturdays = new Set(
  BREW_HISTORY
    .filter(h => h.date && !isExtraHistory(h))   // an accepted extra brew never claims the week's Saturday
    .map(h => parseDate(h.date))
    .filter(Boolean)
    .map(d => wkKey(saturdayOf(d)))
);
const slots = [];

for (let w = 0; w < WEEKS; w++) {
  const sat = addDays(startSat, w * 7);
  slots.push({
    sat,
    key: wkKey(sat),
    brews: [],
    flags: {}
  });
}

const slotMap = {};
slots.forEach(s => slotMap[s.key] = s);

const reservedWeeks = new Set();

// ───────────────────────────────────────────────────────
// PASS 1 - MANUAL OVERRIDES
// ───────────────────────────────────────────────────────

for (const slot of slots) {

  const ov = OVERRIDES[slot.key];

  if (!ov) continue;

  if (ov.skip) {
    slot.flags.skipped = true;
    slot.flags.skipReason = ov.reason || '';
    reservedWeeks.add(slot.key);
    continue;
  }

  if (!ov.beer) continue;

  const beer = beerByName(ov.beer);
  if (!beer) continue;

  const tank =
    tanks.find(t => t.name === ov.tank)
    || T01;

  reservedWeeks.add(slot.key);

  slot.brews.push(
    assignTank(
      tank,
      beer,
      slot.sat,
      []
    )
  );

  slot.flags.overridden = true;
}


// ───────────────────────────────────────────────────────
// PASS 2 - SEASONALS
// ───────────────────────────────────────────────────────

// Build seasonal list — expand multiple targets per beer, both current and next year
const seasonalList = [];
for (const beer of BEERS) {
  if (beer.enabled === false) continue;
  if ((beer.cat || '').toLowerCase() !== 'seasonal') continue;

  // Support both old single target and new targets array
  const targetList = (beer.targets && beer.targets.length)
    ? beer.targets
    : (beer.target ? [beer.target] : []);
  if (!targetList.length) continue;

  for (const tgt of targetList) {
    // Try both current year and next year for each target date
    for (const yr of [startSat.getFullYear(), startSat.getFullYear() + 1]) {
      const serveDate = makeLocalServeDate(yr, tgt);
      if (!serveDate) continue;

      const brewDate = saturdayOnOrBefore(
        addDays(serveDate, -(Number(beer.t || 0) + Number(beer.m || 0)))
      );

      // Only include if brew date falls within our schedule window
      if (brewDate > slots[slots.length - 1].sat) continue;

      const dk = beer.id + '-' + yr + '-' + tgt[0] + '-' + tgt[1];
      seasonalList.push({ beer, serveDate, brewDate, maturation: Number(beer.m || 0), targetKey: dk });
    }
  }
}

// Sort by ideal brew date, then by maturation DESC (longer maturation = less
// flexibility = gets first pick when two seasonals want the same Saturday)
seasonalList.sort((a, b) => {
  const d = a.brewDate - b.brewDate;
  if (d !== 0) return d;
  return b.maturation - a.maturation;
});

// Per-tank free date tracker for Pass 2 — tracks when each tank is free
// based on seasonals already placed in this pass (separate from tank.free
// which reflects only current history-replay occupancy)
const _p2TankFree = { 'Tank 01': new Date(0), 'Tank 02': new Date(0), 'Tank 03': new Date(0) };
const _seasonalPlaced = new Set();

for (const item of seasonalList) {
  if (_seasonalPlaced.has(item.targetKey)) continue;
  const idealBrewDate = new Date(item.brewDate);
  let placed = false;

  // Search BOTH directions from the ideal brew Saturday: try earlier Saturdays
  // first (brewing early just means longer time in the tank before serving,
  // which is harmless), then later Saturdays (up to the point readyDate misses
  // the serve date). This handles same-day collisions between seasonals where
  // one has slack on the early side even though it has none on the late side.
  const candidateSlots = [];
  for (const slot of slots) {
    if (slot.flags && slot.flags.skipped) continue;
    if (slot.sat < TODAY) continue;
    if (historyOccupiedSaturdays.has(slot.key)) continue;
    const readyDate = addDays(slot.sat, Number(item.beer.t||0) + Number(item.beer.m||0));
    if (readyDate > item.serveDate) continue; // would miss the serve date — not a candidate
    candidateSlots.push(slot);
  }
  // Sort candidates by distance from the ideal brew date (closest first),
  // so we prefer the calculated date and only drift away from it when forced to.
  candidateSlots.sort((a, b) =>
    Math.abs(a.sat - idealBrewDate) - Math.abs(b.sat - idealBrewDate)
  );

  for (const slot of candidateSlots) {
    const { sat } = slot;
    // ONE BREW PER SATURDAY — strict, applies even between two seasonals.
    if (slot.brews.length > 0 || (slot.reserved && Object.keys(slot.reserved).length > 0)) continue;

    const preferredTank = item.beer.lane==='ipa' ? T01 : item.beer.lane==='lager' ? T02 : T03;
    const tankAvail = t => isFree(t, sat) && (_p2TankFree[t.name] <= sat);

    // Fallback cascade when the preferred lane tank isn't free: try the flex
    // tank (T03) first, then the lager tank (T02), and only as a last resort
    // the IPA tank (T01) — IPA gets the dedicated fast-cycling tank protected
    // from seasonal encroachment so it can stay on tap. (Not `tanks.find`,
    // which just checks T01/T02/T03 in that literal declaration order.)
    const fallbackOrder = [T03, T02, T01];
    let chosenTank = tankAvail(preferredTank) ? preferredTank
      : fallbackOrder.find(t => tankAvail(t));
    if (!chosenTank) continue; // no tank free this Saturday — try next candidate

    seqCounter[item.beer.name] = (seqCounter[item.beer.name] || 0) + 1;
    const _kd = calcKegDate(null, sat, item.beer.t, []);
    slot.brews.push({ beer: item.beer, tank: chosenTank.name, brewDate: sat,
      kegDate: _kd, readyDate: addDays(sat, item.beer.total),
      batch: nextBatch++, seq: seqCounter[item.beer.name],
      notes: '', manual: false, lane: chosenTank.lane, seasonal: true });
    slot.reserved = slot.reserved || {};
    slot.reserved[chosenTank.name] = true;

    // Advance this tank's Pass-2 free date so subsequent seasonals respect it
    if (_kd) _p2TankFree[chosenTank.name] = _kd;

    // Also commit this reservation to the tank's REAL free-date. Pass 4
    // (Core + Fillers) runs after all seasonals are placed and only checks
    // isFree() against this shared tank state — without this write-back,
    // Pass 4 has no idea a seasonal already claimed time in this tank later
    // in the schedule, and can happily book a core-brand brew whose
    // fermentation window overlaps it (e.g. a core IPA on an earlier
    // Saturday whose keg date lands after this seasonal's brew day).
    // Only ever advance forward, never move it backward.
    if (_kd && (!chosenTank.free || _kd > chosenTank.free)) {
      chosenTank.free = _kd;
    }

    _seasonalPlaced.add(item.targetKey);
    placed = true;
    break;
  }
  if (!placed) {
    console.warn('Unable to place seasonal:', item.beer.name,
      '— brew', idealBrewDate.toDateString(), 'serve', item.serveDate.toDateString());
  }
}



// ───────────────────────────────────────────────────────
// (Pass 3 removed: Kolsch is now a regular seasonal with multiple target dates)

// ── REBUILD TANK FREE DATES BEFORE PASS 4 ────────────────────────────────────
// Strategy:
//   1. Reset to history-only values (removes 2027 contamination from far-future
//      seasonals that Pass 2 may have advanced tank.free to).
//   2. Re-apply occupancy from seasonals placed in Pass 2, BUT only for those
//      within the 52-week schedule window. This preserves the correct sequencing:
//      seasonals place first, Pass 4 fills around them, no double-booking.
[T01, T02, T03].forEach(t => { t.free = new Date(0); });

// Step 1: history replay
sortedHist.forEach(h => {
  const beer2 = (h.beerId != null)
    ? (BEERS.find(b => b.id === h.beerId) || beerByName(h.name))
    : beerByName(h.name);
  if (!beer2) return;
  const brewDate2 = parseDate(h.date);
  const kegDate2  = h.kegDate ? parseDate(h.kegDate) : calcKegDate(null, brewDate2, beer2.t, []);
  if (!kegDate2) return;
  const stillIn2  = kegDate2 <= TODAY && isInTank(h);
  const effFree2  = stillIn2 ? FAR_FUTURE : kegDate2;
  const named2    = tanks.find(t => t.name === h.tank);
  const laneTank2 = beer2.lane === 'ipa' ? T01 : beer2.lane === 'lager' ? T02 : T03;
  const target2   = named2 || laneTank2;
  if (effFree2 > target2.free) { target2.free = effFree2; target2.beerType = beer2.type; }
});

// Step 2 intentionally removed.
// Tank free dates after history replay are sufficient for Pass 4.
// The wouldBlockSeasonal() helper in Pass 4 prevents scheduling a core/filler
// brew that would still be fermenting when an upcoming seasonal needs that tank.
// This avoids the problem of far-future seasonals (Feb 2027 Fiddlers Flame)
// incorrectly blocking Tank 02 for months.
console.log('[PRE-PASS4] Tank free dates (history only) — T01:',
  fmtISO(T01.free), 'T02:', fmtISO(T02.free), 'T03:', fmtISO(T03.free));

// PASS 4 - CORE + FILLERS
// ───────────────────────────────────────────────────────
// Rules:
//   Each Saturday: ONE brew total (one brewhouse).
//   Priority: T01 (IPA) > T02 (Lager) > T03 (Filler).
//   T03 filler only schedules if BOTH T01 and T02 are currently occupied
//   (i.e. core IPA and core Lager are already fermenting or conditioning).
//   Beers are selected by lane + cat, sorted by rotationOrder.
//   Seasonals placed in Pass 2 already occupy their Saturday slots —
//   this pass skips those Saturdays entirely (slot.brews.length > 0).

// Build rotation lists by lane and category
const ipaCore = BEERS
  .filter(b => b.enabled !== false && b.lane === 'ipa' && b.cat === 'core brand')
  .sort((a,b) => (a.rotationOrder || 99) - (b.rotationOrder || 99));

const lagers = BEERS
  .filter(b => b.enabled !== false && b.lane === 'lager' && b.cat === 'core brand')
  .sort((a,b) => (a.rotationOrder || 99) - (b.rotationOrder || 99));

const fillers = BEERS
  .filter(b => b.enabled !== false && b.cat === 'filler')
  .sort((a,b) => (a.rotationOrder || 99) - (b.rotationOrder || 99));

// Seed rotation indices from last actual brew of each type in history
function getRotIdx(list) {
  if (!list.length) return 0;
  const last = [...BREW_HISTORY]
    .filter(h => h.date && parseDate(h.date) <= TODAY)
    .reverse()
    .find(h => list.some(b => b.name === h.name));
  if (!last) return 0;
  const idx = list.findIndex(b => b.name === last.name);
  return idx < 0 ? 0 : (idx + 1) % list.length;
}

let ipaIdx    = getRotIdx(ipaCore);
let lagerIdx  = getRotIdx(lagers);
let fillerIdx = getRotIdx(fillers);

console.log('[Pass4] ipaCore:', ipaCore.map(b=>b.name),
            '| lagers:', lagers.map(b=>b.name),
            '| fillers:', fillers.map(b=>b.name));
console.log('[Pass4] ipaIdx:', ipaIdx, 'lagerIdx:', lagerIdx, 'fillerIdx:', fillerIdx);
console.log('[Pass4] T01.free:', fmtISO(T01.free), 'T02.free:', fmtISO(T02.free), 'T03.free:', fmtISO(T03.free));

// Build a lookup of seasonal brew dates per tank so Pass 4 can avoid
// scheduling a core/filler brew that would still be fermenting when the
// seasonal needs that tank.
// key: tankName, value: sorted array of {brewSat, kegDate} for upcoming seasonals
const _seasonalSchedule = { 'Tank 01': [], 'Tank 02': [], 'Tank 03': [] };
slots.forEach(slot => {
  if (!slot.brews || !slot.brews.length) return;
  const b = slot.brews[0];
  if (!b || !b.seasonal) return;
  const sat2 = slot.sat instanceof Date ? slot.sat : parseDate(slot.sat);
  if (!sat2 || sat2 <= TODAY) return;
  if (_seasonalSchedule[b.tank]) {
    _seasonalSchedule[b.tank].push({ brewSat: sat2, kegDate: b.kegDate });
  }
});

// Helper: would placing a brew of tankDays duration in a tank on brewSat
// conflict with the next upcoming seasonal in that tank?
function wouldBlockSeasonal(tank, brewSat, tankDays) {
  const upcoming = (_seasonalSchedule[tank.name] || [])
    .filter(s => s.brewSat > brewSat)
    .sort((a, b) => a.brewSat - b.brewSat);
  if (!upcoming.length) return false;
  const next = upcoming[0];
  // The brew would keg at brewSat + tankDays. If that's after the seasonal's
  // brew date, it would still be fermenting when the seasonal needs the tank.
  const wouldKegAfter = addDays(brewSat, tankDays);
  return wouldKegAfter > next.brewSat;
}

for (const slot of slots) {
  if (slot.flags && slot.flags.skipped) continue;

  // Skip weeks where a real brew already happened (history)
  if (historyOccupiedSaturdays.has(slot.key)) continue;

  // Skip weeks where a seasonal (Pass 2) already filled this slot
  if (slot.brews.length > 0) continue;

  const sat = slot.sat;
  const weekKegDates = [];

  // Check what's currently free AND won't block an upcoming seasonal
  const nextIPA    = ipaCore[ipaIdx % ipaCore.length];
  const nextLager  = lagers[lagerIdx % lagers.length];
  const nextFiller = fillers[fillerIdx % fillers.length];

  const t01Free = isFree(T01, sat) && !(nextIPA   && wouldBlockSeasonal(T01, sat, nextIPA.t));
  const t02Free = isFree(T02, sat) && !(nextLager  && wouldBlockSeasonal(T02, sat, nextLager.t));
  // T03 also checks _p2TankFree — the seasonal pass occupancy tracker.
  // This prevents scheduling a filler into T03 the week after a Kolsch
  // (or other seasonal) was placed there, even though tank.free (history-only)
  // doesn't know the seasonal is occupying it.
  // T03 is free if:
  // 1. History says tank is free (isFree)
  // 2. No seasonal brew is currently occupying T03 on this Saturday
  //    (check slot array directly — avoids _p2TankFree accumulation bug
  //     where a Nov 2027 seasonal blocks T03 for an entire year)
  // 3. A filler brew placed now won't still be fermenting when the next
  //    T03 seasonal needs the tank (wouldBlockSeasonal)
  const t03SeasonalOccupied = slots.some(s => {
    if (!s.brews || !s.brews.length) return false;
    const b = s.brews[0];
    if (!b || b.tank !== 'Tank 03') return false;
    const brewSat = s.sat instanceof Date ? s.sat : parseDate(s.sat);
    if (!brewSat || !b.kegDate) return false;
    // Is this Saturday within the fermenting window of a T03 brew?
    return sat > brewSat && sat < b.kegDate;
  });
  const t03Free = isFree(T03, sat) && !t03SeasonalOccupied &&
                  !(nextFiller && wouldBlockSeasonal(T03, sat, (nextFiller||{}).t||21));

  // PRIORITY WATERFALL — one brew per Saturday, highest priority first
  if (ipaCore.length && t01Free) {
    // T01 is free and won't block a seasonal → brew next core IPA
    slot.brews.push(assignTank(T01, ipaCore[ipaIdx++ % ipaCore.length], sat, weekKegDates));

  } else if (lagers.length && t02Free) {
    // T02 is free and won't block a seasonal → brew next core Lager
    slot.brews.push(assignTank(T02, lagers[lagerIdx++ % lagers.length], sat, weekKegDates));

  } else if (fillers.length && t03Free && !isFree(T01, sat) && !isFree(T02, sat)) {
    // T03 free AND both core lanes currently occupied → brew filler
    slot.brews.push(assignTank(T03, fillers[fillerIdx++ % fillers.length], sat, weekKegDates));
  }
  // All occupied or conflict with upcoming seasonal → no brew this Saturday
}

console.log('[PASS4 DONE] First 10 scheduled:',
  slots.filter(s=>s.brews.length>0).slice(0,10)
    .map(s => fmtISO(s.sat)+' '+s.brews[0].tank+' → '+s.brews[0].beer.name)
);

console.log('[Pass4] First 8 scheduled:',
  slots.filter(s=>s.brews.length>0).slice(0,8)
       .map(s=>fmtISO(s.sat)+' '+s.brews[0].tank+' → '+s.brews[0].beer.name)
);
console.log('[Pass4] Empty Saturdays (first 6):',
  slots.filter(s=>s.brews.length===0&&!(s.flags&&s.flags.skipped)&&!historyOccupiedSaturdays.has(s.key))
       .slice(0,6).map(s=>fmtISO(s.sat))
);




// ── Accepted extra brews (approved gap-fillers) ───────────────────────────
// Added after the passes so they never change what the auto-scheduler picks.
// They join their week's slot with their own (non-Saturday) brew date, and are
// renumbered chronologically below like every other future brew.
(EXTRA_BREWS.accepted || []).forEach(x => {
  const d = parseDate(x.date);
  if (!d || d < TODAY) return;                 // already past — the real batch is in history
  if (extraMatchesHistory(x)) return;          // already logged in Brewfather
  const beer = beerByName(x.beer);
  if (!beer) return;
  const slot = slotMap[wkKey(saturdayOf(d))];
  if (!slot) return;
  const tk = tanks.find(t => t.name === x.tank);
  seqCounter[beer.name] = (seqCounter[beer.name] || 0) + 1;
  slot.brews.push({
    beer, tank: x.tank, brewDate: d,
    kegDate: calcKegDate(null, d, beer.t, []),
    readyDate: addDays(d, beer.total),
    batch: 0, seq: seqCounter[beer.name],
    notes: 'Extra brew (accepted suggestion)',
    manual: false, extra: true, extraId: x.id,
    lane: tk ? tk.lane : beer.lane
  });
});

// ── Renumber batches in strict chronological order ────────────────────────
// Passes 1-4 assign batch numbers in pass order (seasonals first), which
// causes out-of-sequence numbers. Collect all future brews, sort by brew
// date, then assign consecutive batch numbers starting from nextBatch.
const allFutureBrews = [];
slots.forEach(slot => {
  slot.brews.forEach(b => {
    // Only renumber brews not already in history (manual overrides keep their number)
    if (!b.manual) allFutureBrews.push(b);
  });
});

// Sort by brew date ascending, then by tank name as tiebreak
allFutureBrews.sort((a, b) => {
  const da = a.brewDate instanceof Date ? a.brewDate : parseDate(a.brewDate);
  const db = b.brewDate instanceof Date ? b.brewDate : parseDate(b.brewDate);
  if (da - db !== 0) return da - db;
  return (a.tank||'').localeCompare(b.tank||'');
});

// Assign sequential batch numbers
const batchStart = Math.max(...BREW_HISTORY.map(h => h.batch || 0), 552) + 1;
allFutureBrews.forEach((b, i) => { b.batch = batchStart + i; });



// Commit slots to SCHEDULE
for (const slot of slots) {
  const entry = {
    sat: slot.sat,
    key: slot.key,
    brews: slot.brews
  };

  if (slot.flags.skipped) {
    entry.skipped = true;
    entry.skipReason = slot.flags.skipReason || '';
  }

  if (slot.flags.overridden) {
    entry.overridden = true;
  }

  SCHEDULE.push(entry);
}

_nextBatchId =
  Math.max(
    ...BREW_HISTORY.map(h => h.batch || 0),
    552
  ) + 1;

}

function beerByName(name, t, m){
  // t and m are optional — passed by BF sync to pick the right variant by timing
  if(!name) return null;
  const k = name.toLowerCase().trim();

  // Collect all name matches
  let matches = BEERS.filter(b => b.name.toLowerCase().trim() === k);
  if(!matches.length) matches = BEERS.filter(b => b.name.toLowerCase().trim().startsWith(k));
  if(!matches.length) matches = BEERS.filter(b => k.startsWith(b.name.toLowerCase().trim()));
  if(!matches.length) return null;

  // Single match — return directly
  if(matches.length === 1) return matches[0];

  // Multiple variants: if t+m provided (BF sync), prefer the variant whose timing matches
  if(t != null && m != null){
    const exact = matches.find(b => b.t === t && b.m === m);
    if(exact) return exact;
  }

  // Tiebreak: prefer enabled, then lowest pri, then first
  return matches.filter(b => b.enabled !== false).sort((a,b) => (a.pri||9)-(b.pri||9))[0] || matches[0];
}

const STYLE_CLR = {IPA:'#2a6abf',Lager:'#c49010',Kolsch:'#4a8c2a',Ale:'#3a7a20',Bock:'#b03820',Porter:'#7a5840',Stout:'#504030','Spruce Ale':'#3a6048',Spirit:'#c47800',Other:'#6a6050'};

function clr(beer){ return STYLE_CLR[beer.type||beer.style]||'#6a6050'; }

function badgeCls(beer){ return {IPA:'b-ipa',Lager:'b-lager',Kolsch:'b-kolsch',Ale:'b-ale',Bock:'b-bock',Porter:'b-porter',Stout:'b-stout','Spruce Ale':'b-ale',Spirit:'b-spirit'}[beer.type||beer.style]||'b-filler'; }

function isInTank(h){
  // Ask Brewfather first — most accurate
  // Only Brewing and Fermenting mean physically in a fermenter tank.
  // Conditioning = kegged/bottled (not in tank). Planning = not brewed yet.
  const bf = BF_BATCH_CACHE[h.batch];
  if(bf && bf.status && bf.status !== 'Unknown'){
    return BF_IN_TANK_STATUSES.has(bf.status);
  }
  // Also check the stored bfStatus from import
  if(h.bfStatus && h.bfStatus !== 'Unknown'){
    return BF_IN_TANK_STATUSES.has(h.bfStatus);
  }
  // No BF data — fall back to date math
  const beer = beerByName(h.name);
  const brewDate = parseDate(h.date);
  // If brew date is in the future, batch isn't in a tank yet
  if(brewDate > TODAY) return false;
   // new code to always use BF bottlingDate
  const kegDate = h.kegDate ? parseDate(h.kegDate) : null;
  // In tank if we haven't kegged it yet
  return kegDate ? kegDate > TODAY : false;
}

function getTankStatusLabel(h){
  const bf = BF_BATCH_CACHE[h.batch];
  if (bf && bf.status && bf.status !== 'Unknown') return bf.status;
  const beer = beerByName(h.name);
  const brewDate = parseDate(h.date);
  if (brewDate > TODAY) return 'Planned';
  const kegDate = h.kegDate ? parseDate(h.kegDate) : null;
  if (kegDate && kegDate <= TODAY) return 'Kegged';
  return 'Fermenting';
}

function getCurrentTanks(){
  const t=[
    {name:'Tank 01',beer:null,brewDate:null,endDate:null,batch:null,seq:null,bfStatus:null},
    {name:'Tank 02',beer:null,brewDate:null,endDate:null,batch:null,seq:null,bfStatus:null},
    {name:'Tank 03',beer:null,brewDate:null,endDate:null,batch:null,seq:null,bfStatus:null}
  ];
  // Sort by batch number DESCENDING — highest (most recent) batch wins each named tank slot.
  // This ensures the current brews show, not old archived ones.
  [...BREW_HISTORY]
    .sort((a,b)=> b.batch - a.batch)
    .forEach(h=>{
      if(!h.date) return;  // no brew date — Planning batch not yet brewed
      if(!isInTank(h)) return;  // BF or date math says not in a tank
      const beer=beerByName(h.name); if(!beer) return;
      const brewDate=parseDate(h.date);
      if(!brewDate) return;
      const kegDate=h.kegDate?parseDate(h.kegDate):(beer?calcKegDate(null,brewDate,beer.t,[]):null);
      // Always use the exact tank recorded in history — never reassign to a different slot
      const slot=t.find(x=>x.name===h.tank);
      if(slot && !slot.beer){
        slot.beer=beer; slot.brewDate=brewDate;
        slot.endDate=kegDate; slot.batch=h.batch; slot.seq=h.seq;
        slot.bfStatus=getTankStatusLabel(h);
      }
    });
  return t;
}

function getDashUpcomingWeeks(){
  const histByKey = {};
  BREW_HISTORY.forEach(h => {
    if(!h.date) return;
    const d = parseDate(h.date); if(!d || d < TODAY) return;   // already brewed
    const beer = beerByName(h.name); if(!beer) return;
    const sat = saturdayOf(d), k = wkKey(sat);
    if(!histByKey[k]) histByKey[k] = {sat, key:k, brews:[]};
    histByKey[k].brews.push({
      beer, tank:h.tank, brewDate:d,
      kegDate: h.kegDate ? parseDate(h.kegDate) : calcKegDate(null, d, beer.t, []),
      readyDate: addDays(d, beer.total), batch:h.batch, seq:h.seq
    });
  });
  // Weeks that hold a dated history batch normally show only that batch. Accepted extra
  // brews (and the Saturday brew of a week whose history entry IS an accepted extra) still count.
  const extraWeeks = getExtraWeekKeys();
  const weeks = SCHEDULE.map(w => {
    const hw = histByKey[w.key];
    if(!hw) return w;
    const keep = (w.brews || []).filter(b => b.extra || extraWeeks.has(w.key));
    return Object.assign({}, hw, { brews: hw.brews.concat(keep) });
  }).concat(Object.values(histByKey).filter(hw => !SCHEDULE.some(w => w.key === hw.key)));
  weeks.forEach(w => { if(w.brews) w.brews = w.brews.slice().sort((a,b) => (a.brewDate||w.sat) - (b.brewDate||w.sat)); });
  return weeks.sort((a,b) => a.sat - b.sat);
}

const TANK_CLEAN_DAYS = 1;

const GAP_DETAIL_MIN  = 3;

const TANK_LANE = { 'Tank 01':'ipa', 'Tank 02':'lager', 'Tank 03':'flex' };

function getTankGaps(ct, upWeeks){
  const DAY = 86400000;
  const diff = (a,b) => Math.round((b - a) / DAY);
  const wd = d => d.toLocaleDateString('en-US',{weekday:'short'});
  // Every upcoming brew in every tank — explains WHY a tank waited, and blocks double-booking a day
  const allBrews = [];
  upWeeks.forEach(w => (w.brews || []).forEach(b => {
    if(!b.beer) return;
    const bd = b.brewDate || w.sat;
    if(bd) allBrews.push({ beer:b.beer, tank:b.tank || null, brewDate:bd, batch:b.batch });
  }));
  const candidates = (BEERS || []).filter(b => b.enabled !== false && b.t > 0);
  const tanks = [];
  let unassigned = 0;

  ct.forEach(t => {
    const upcoming = [];
    upWeeks.forEach(w => (w.brews || []).forEach(b => {
      if(!b.beer) return;
      if(!b.tank){ if(t.name === 'Tank 01') unassigned++; return; }
      if(b.tank !== t.name) return;
      const bd = b.brewDate || w.sat;
      if(!bd || !b.kegDate) return;
      upcoming.push({ beer:b.beer, brewDate:bd, kegDate:b.kegDate, batch:b.batch, extra:!!b.extra });
    }));
    upcoming.sort((a,b) => a.brewDate - b.brewDate);

    // Earliest the tank can be refilled: day after current batch kegs, or today if empty
    let cursor = t.beer && t.endDate ? addDays(t.endDate, TANK_CLEAN_DAYS) : TODAY;
    if(cursor < TODAY) cursor = TODAY;
    const emptyNow = !t.beer;
    const gaps = [];
    let conflict = null;

    upcoming.forEach(u => {
      const idle = diff(cursor, u.brewDate);
      if(idle > 0){
        const gap = { from:cursor, to:u.brewDate, idle, beer:u.beer, emptyNow: emptyNow && gaps.length === 0,
                      blockers:[], fits:[], brewDate:null, dayTaken:false, declined:false,
                      declineKey: `${t.name}|${fmtISO(cursor)}|${fmtISO(u.brewDate)}` };
        if(idle >= GAP_DETAIL_MIN){
          // Why: brews in OTHER tanks that landed inside this window (one-brew-per-week rule)
          gap.blockers = allBrews
            .filter(b => b.tank !== t.name && b.brewDate >= gap.from && b.brewDate < gap.to)
            .sort((a,b) => a.brewDate - b.brewDate);
          // Suggested extra brew day: first extra-brew weekday on/after the earliest refill, inside the gap
          let bd = new Date(gap.from);
          for(let i = 0; i < 7 && bd.getDay() !== EXTRA_BREWS.dow; i++) bd = addDays(bd, 1);
          gap.brewDate = (bd.getDay() === EXTRA_BREWS.dow && bd < gap.to) ? bd : null;
          gap.declined = (EXTRA_BREWS.declined || []).includes(gap.declineKey);
          if(gap.brewDate) gap.dayTaken = allBrews.some(b => fmtISO(b.brewDate) === fmtISO(gap.brewDate));
          if(gap.brewDate && !gap.dayTaken && !gap.declined){
            const laneWant = TANK_LANE[t.name];
            candidates.forEach(c => {
              const keg = calcKegDate(null, gap.brewDate, c.t, []);
              if(!keg) return;
              const slack = diff(addDays(keg, TANK_CLEAN_DAYS), gap.to);
              if(slack >= 0) gap.fits.push({ beer:c, keg, slack, offLane: !!laneWant && !!c.lane && c.lane !== laneWant });
            });
            gap.fits.sort((a,b) => (a.offLane - b.offLane) || (a.slack - b.slack) || a.beer.name.localeCompare(b.beer.name));
          }
        }
        gaps.push(gap);
      } else if(idle < 0 && !conflict){
        conflict = { beer:u.beer, brewDate:u.brewDate, overlapDays:-idle };
      }
      cursor = addDays(u.kegDate, TANK_CLEAN_DAYS);
    });

    tanks.push({
      name:t.name, emptyNow, gaps, conflict,
      totalIdle: gaps.reduce((n,g) => n + g.idle, 0),
      openFrom: cursor,
      hasMore: upcoming.length > 0,
      scheduledCount: upcoming.length
    });
  });
  return { tanks, unassigned, wd };
}

let BF_BATCH_CACHE = {};

const BF_STATUS_MAP = {
  'Planning':     { label:'BF Planning',  color:'var(--blue2)',  desc:'Planned in Brewfather — not yet brewed' },
  'Brewing':      { label:'Brewing',      color:'var(--amber)',  desc:'Brew day in progress' },
  'Fermenting':   { label:'Fermenting',   color:'var(--blue2)',  desc:'In a fermenter tank' },
  'Conditioning': { label:'Conditioning', color:'var(--gold2)',  desc:'Kegged or bottled, conditioning' },
  'Completed':    { label:'Completed',    color:'var(--hops)',   desc:'Packaging complete' },
  'Serving':      { label:'Serving',      color:'#c47000',       desc:'Currently on tap and being served' },
  'Archived':     { label:'Archived',     color:'var(--muted)',  desc:'All packaging consumed/empty' },
  'Kegerator':	  { label:'Kegerator', color:'var(green)', desc: 'Keg serving in Kegerator'},
};

const BF_IN_TANK_STATUSES    = new Set(['Brewing','Fermenting']);

function fmtMDY(d){
  if(!d || isNaN(new Date(d).getTime())) return '—';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[d.getMonth()] + ' ' + String(d.getDate()).padStart(2,'0') + ' ' + d.getFullYear();
}

function getBatchStatus(h, brewDateOverride){
  // ── Source 1: Live BF cache (most current) ──
  const cached = BF_BATCH_CACHE[h.batch];
  if(cached && cached.status && cached.status !== 'Unknown'){
    const map = BF_STATUS_MAP[cached.status];
    if(map) return { label:map.label, color:map.color, source:'bf', desc:map.desc };
    return { label:cached.status, color:'var(--muted)', source:'bf', desc:'' };
  }

  // ── Source 2: bfStatus stored at import time ──
  if(h.bfStatus && h.bfStatus !== 'Unknown'){
    const map = BF_STATUS_MAP[h.bfStatus];
    if(map) return { label:map.label, color:map.color, source:'bf-stored', desc:map.desc+'  (from last import)' };
    return { label:h.bfStatus, color:'var(--muted)', source:'bf-stored', desc:'' };
  }

  // ── Source 3: Date math fallback — no BF data ──
  const beer = beerByName(h.name);
  const bd   = brewDateOverride || (h.date ? parseDate(h.date) : null);

  // No brew date → batch is planned but not yet scheduled to brew
  if(!bd) return { label:'BF Planning', color:'var(--blue2)', source:'calc',
    desc:'Planned in Brewfather — no brew date set yet' };

  // Future brew date → planned/scheduled
  if(bd > TODAY) return { label:'BF Planning', color:'var(--blue2)', source:'calc',
    desc:'Brew date in the future — not yet started' };

  const kd = h.kegDate ? parseDate(h.kegDate) : (beer ? calcKegDate(null,bd,beer.t,[]) : null);
  const rd = beer ? addDays(bd, beer.total) : null;

  if(rd && rd <= TODAY) return { label:'Completed',    color:'var(--hops)',   source:'calc', desc:'Estimated complete' };
  if(kd && kd <= TODAY) return { label:'Conditioning', color:'var(--gold2)',  source:'calc', desc:'Estimated conditioning' };
  return                       { label:'Fermenting',   color:'var(--blue2)',  source:'calc', desc:'Estimated fermenting' };
}

  // ======== Dashboard wrapper (not part of the original Scheduler code) ========
  const clone = x => JSON.parse(JSON.stringify(x));
  function setData(d){
    BEERS = clone(d.beers || []);
    BEERS.forEach(b => { if(!b.lane){ b.lane = b.type === 'IPA' ? 'ipa' : (b.type === 'Lager' ? 'lager' : 'flex'); } });
    BREW_HISTORY = clone(d.history || []);
    OVERRIDES = clone(d.overrides || {});
    KEG_SETTINGS = clone(d.kegSettings || {});
    const x = d.extraBrews || {};
    EXTRA_BREWS = { dow: Number.isInteger(x.dow) ? x.dow : 1,
                    accepted: Array.isArray(x.accepted) ? clone(x.accepted) : [],
                    declined: Array.isArray(x.declined) ? clone(x.declined) : [] };
    BF_BATCH_CACHE = clone(d.bfBatchCache || {});
    const histKeys = new Set(BREW_HISTORY.filter(h => h.date).map(h => { const dd = parseDate(h.date); return dd ? wkKey(saturdayOf(dd)) : null; }).filter(Boolean));
    Object.keys(OVERRIDES).forEach(k => { if(histKeys.has(k) && OVERRIDES[k].skip) delete OVERRIDES[k]; });
  }
  function build(d){
    const t = new Date(); t.setHours(0,0,0,0); TODAY = t;
    setData(d);
    const log = console.log; console.log = () => {};
    try { rebuildSchedule(); } finally { console.log = log; }
    const tanksNow = getCurrentTanks(), upcoming = getDashUpcomingWeeks();
    return { today: TODAY, schedule: SCHEDULE, tanksNow, upcoming, gaps: getTankGaps(tanksNow, upcoming), extraBrews: EXTRA_BREWS };
  }
  // History + schedule merged into a W-week window (same logic as the Scheduler's timeline)
  function timelineWeeks(offset, W){
    const startSat = saturdayOf(TODAY), past = {};
    BREW_HISTORY.forEach(h => {
      if(!h.date) return;
      const sat = saturdayOf(parseDate(h.date)); if(!sat) return;
      const k = wkKey(sat); if(!past[k]) past[k] = { sat, key:k, brews:[] };
      const beer = beerByName(h.name);
      past[k].brews.push({ beer, tank:h.tank, brewDate:parseDate(h.date),
        kegDate: h.kegDate ? parseDate(h.kegDate) : (beer ? calcKegDate(null, parseDate(h.date), beer.t, []) : null),
        readyDate: beer ? addDays(parseDate(h.date), beer.total) : null, batch:h.batch, seq:h.seq });
    });
    const out = [];
    for(let w = offset; w < offset + W; w++){
      const sat = addDays(startSat, w*7), k = wkKey(sat);
      out.push(past[k] || SCHEDULE.find(x => x.key === k) || { sat, key:k, brews:[] });
    }
    return out;
  }
  // Brew History rows: same computed fields as the Scheduler's renderHistory (status from BF cache, days on tap, per-beer averages)
  function historyRows(d){
    const t = new Date(); t.setHours(0,0,0,0); TODAY = t;
    setData(d);
    const list = BREW_HISTORY.map(h => {
      const beer = beerByName(h.name), bd = h.date ? parseDate(h.date) : null;
      const kd = h.kegDate ? parseDate(h.kegDate) : (beer && bd ? calcKegDate(null, bd, beer.t, []) : null);
      const rd = beer && bd ? addDays(bd, beer.total) : null;
      const tappedActual = h.dateTapped ? parseDate(h.dateTapped) : null, tappedDate = tappedActual || rd;
      const kickedDate = h.dateKicked ? parseDate(h.dateKicked) : null;
      const daysOnTap = (tappedActual && kickedDate) ? Math.round((kickedDate - tappedActual) / 86400000) : null;
      const st = getBatchStatus(h, bd);
      return { h, beer, bd, kd, rd, tappedDate, tappedActual, kickedDate, daysOnTap,
        statusLabel: st.label, statusColor: st.color, source: st.source, statusDesc: st.desc || '' };
    });
    const by = {};
    list.forEach(r => { if(r.daysOnTap == null) return; (by[r.h.name] = by[r.h.name] || []).push(r.daysOnTap); });
    list.forEach(r => { const a = by[r.h.name]; r.avgDaysOnTap = a ? Math.round(a.reduce((s,v) => s+v, 0) / a.length) : null; });
    return list;
  }
  return { build, historyRows, fmtMDY, fmtFull, timelineWeeks, clr, addDays, saturdayOf, wkKey, parseDate, fmtISO, GAP_DETAIL_MIN, STYLE_CLR };
})();
