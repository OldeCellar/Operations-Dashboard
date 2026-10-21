#!/usr/bin/env python3
"""
Nightly Brewfather -> History import (incremental, additive).

Runs after the main "Sync Brewfather" step in bf_sync.yml. It ports the logic of the Scheduler's
"Import all batches into history" button, but never rebuilds or deletes anything:

  * NEW batches (batch number not yet in history) are added with the same rules the Scheduler used:
    sequence number, brew/keg dates, tank (BF "Tank Number" field, else lane default if free), Date Tapped / Date Kicked.
  * EXISTING batches only get their Brewfather-owned fields refreshed: Tank Number, Date Tapped, Date Kicked,
    Brewfather status (a logged Date Kicked means Archived). Seq, notes and manual keg dates are never touched.

If anything looks wrong (a Brewfather request fails, too few batches come back) it changes nothing and exits.
"""
import json
import os
import re
import sys
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

DATA_FILE = 'brewery_data.json'
EASTERN = ZoneInfo('America/New_York')       # same calendar-day convention as the main sync step
ALL_STATUSES = ['Planning', 'Brewing', 'Fermenting', 'Conditioning', 'Serving', 'Completed', 'Archived']
STATUS_PRIORITY = {'Fermenting': 1, 'Brewing': 2, 'Conditioning': 3, 'Serving': 3, 'Planning': 4, 'Completed': 5, 'Archived': 6}
PAGE = 50


# ---------------------------------------------------------------- helpers (ports of the Scheduler's JS)
def ts_to_iso(ms):
    if not ms:
        return ''
    try:
        return datetime.fromtimestamp(int(ms) / 1000, tz=EASTERN).strftime('%Y-%m-%d')
    except (TypeError, ValueError, OSError, OverflowError):
        return ''


def measurement_value(batch, label):
    """extractBFMeasurementValue: newest non-empty measurement whose text matches label (case/space-insensitive)."""
    ms = batch.get('measurements')
    if not isinstance(ms, list) or not ms:
        return None
    norm = label.strip().lower()
    hits = [m for m in ms if isinstance(m, dict) and isinstance(m.get('text'), str)
            and m['text'].strip().lower() == norm and m.get('value') not in (None, '')]
    if not hits:
        return None
    hits.sort(key=lambda m: m.get('timestamp') or 0, reverse=True)
    return hits[0]['value']


def tank_number(batch):
    """extractBFTankNumber"""
    raw = measurement_value(batch, 'Tank Number')
    if raw is None:
        return None
    s = str(raw).strip()
    m = re.search(r'\d+', s)
    if m:
        return 'Tank ' + str(int(m.group(0))).zfill(2)
    return s or None


def compact_date(value):
    """parseBFCompactDate: 7302026 -> 2026-07-30 (month+day+4-digit year, no separators)"""
    if value is None or value == '':
        return None
    s = str(value).strip()
    if not re.fullmatch(r'\d+', s) or len(s) < 7:
        return None
    year, rest = int(s[-4:]), s[:-4]
    day, month = int(rest[-2:]), int(rest[:-2] or 0)
    if not (1 <= month <= 12 and 1 <= day <= 31 and 2000 <= year <= 2100):
        return None
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def compact_date_field(batch, label):
    raw = measurement_value(batch, label)
    return None if raw is None else compact_date(raw)


def beer_by_name(beers, name):
    """beerByName: exact, then prefix, then reverse-prefix; ties -> enabled, then lowest priority."""
    if not name:
        return None
    k = name.lower().strip()
    nm = lambda b: b['name'].lower().strip()
    matches = [b for b in beers if nm(b) == k] or [b for b in beers if nm(b).startswith(k)] or [b for b in beers if k.startswith(nm(b))]
    if not matches:
        return None
    if len(matches) == 1:
        return matches[0]
    enabled = sorted([b for b in matches if b.get('enabled') is not False], key=lambda b: b.get('pri') or 9)
    return enabled[0] if enabled else matches[0]


def calc_keg_date(brew_iso, tank_days):
    """calcKegDate (no collision list): brew + tank days, rolled back to the Wednesday on or before."""
    d = date.fromisoformat(brew_iso) + timedelta(days=tank_days)
    js_dow = (d.weekday() + 1) % 7                    # JS getDay(): Sun=0 .. Sat=6
    back = js_dow - 3 if js_dow >= 3 else js_dow + 4
    return (d - timedelta(days=back)).isoformat()


# ---------------------------------------------------------------- the import
def dedupe(batches):
    best = {}
    for b in batches:
        no = b.get('batchNo') or 0
        if not no:
            continue
        cur = best.get(no)
        if cur is None or STATUS_PRIORITY.get(b.get('status'), 99) < STATUS_PRIORITY.get(cur.get('status'), 99):
            best[no] = b
    return [best[n] for n in sorted(best)]


def run(data, bf_batches, log=print):
    """Apply the import to `data` in place. Returns (added, updated)."""
    beers = data.get('beers', [])
    history = data.setdefault('history', [])
    cache = data.setdefault('bfBatchCache', {})
    by_no = {int(h['batch']): h for h in history if h.get('batch') is not None}
    seq_start = {}
    for b in beers:
        v = b.get('seqStart')
        if v not in (None, ''):
            seq_start.setdefault(b['name'], int(v))

    # projected tank occupancy, seeded from existing history (used only for the lane-default fallback)
    busy = {}
    for h in history:
        if h.get('tank') and h.get('kegDate'):
            if h['tank'] not in busy or h['kegDate'] > busy[h['tank']]:
                busy[h['tank']] = h['kegDate']

    added = updated = conflicts = 0
    for b in dedupe(bf_batches):
        no = b['batchNo']
        recipe = (b.get('recipe') or {}).get('name') or b.get('name') or ''
        matched = beer_by_name(beers, recipe)
        bf_tank = tank_number(b)
        tapped = compact_date_field(b, 'Date Tapped')
        kicked = compact_date_field(b, 'Date Kicked')
        status = 'Archived' if kicked else (b.get('status') or '')
        entry = by_no.get(no)

        if entry is not None:                              # ---- existing: refresh Brewfather-owned fields only
            changed = False
            def setf(key, val):
                nonlocal changed
                if val not in (None, '') and entry.get(key) != val:
                    entry[key] = val
                    changed = True
            setf('tank', bf_tank); setf('dateTapped', tapped); setf('dateKicked', kicked)
            if status and entry.get('bfStatus') != status:
                entry['bfStatus'] = status; changed = True
            if matched and entry.get('beerId') is None:
                entry['beerId'] = matched['id']; changed = True
            if changed:
                updated += 1
                log(f'  Updated #{no} {entry.get("name", recipe)}')
            if entry.get('tank') and entry.get('kegDate') and (entry['tank'] not in busy or entry['kegDate'] > busy[entry['tank']]):
                busy[entry['tank']] = entry['kegDate']
            keg_for_cache = entry.get('kegDate') or None
            tank_for_cache = bf_tank
        else:                                              # ---- new batch: same rules as the Scheduler's import
            brew_iso = ts_to_iso(b.get('brewDate')) if b.get('brewDate') else ''
            if b.get('bottlingDate'):
                keg_iso = ts_to_iso(b['bottlingDate'])
            elif brew_iso:
                nb = beer_by_name(beers, b.get('name') or recipe)
                keg_iso = calc_keg_date(brew_iso, nb['t']) if nb else ''
            else:
                keg_iso = ''
            prior = [int(h['seq']) for h in history if h.get('name') == recipe and str(h.get('seq', '')).isdigit()]
            seq = (max(prior) + 1) if prior else seq_start.get(recipe, 1)
            lane_tank = {'ipa': 'Tank 01', 'lager': 'Tank 02'}.get(matched['lane'], 'Tank 03') if matched else 'Tank 01'
            if bf_tank:
                tank = bf_tank
            elif brew_iso and busy.get(lane_tank) and brew_iso < busy[lane_tank]:
                tank = ''; conflicts += 1                  # lane tank still busy: leave blank for manual assignment
            else:
                tank = lane_tank
            if tank and keg_iso and (tank not in busy or keg_iso > busy[tank]):
                busy[tank] = keg_iso
            entry = {'batch': no, 'name': recipe, 'beerId': matched['id'] if matched else None, 'seq': seq,
                     'date': brew_iso, 'kegDate': keg_iso, 'tank': tank, 'dateTapped': tapped or '',
                     'dateKicked': kicked or '', 'notes': '', 'bfStatus': status}
            history.append(entry); by_no[no] = entry
            added += 1
            log(f'  ADDED #{no} {recipe}  seq {seq}  brew {brew_iso or "-"}  keg {keg_iso or "-"}  tank {tank or "(blank: lane tank busy)"}  status {status}')
            keg_for_cache = keg_iso or None
            tank_for_cache = bf_tank

        c = cache.get(str(no), {})                          # keep the cache's extra fields current (never drop existing keys)
        c.update({'status': 'Archived' if kicked else (b.get('status') or c.get('status') or 'Unknown'),
                  'recipeName': recipe, 'bfId': b.get('_id', c.get('bfId', ''))})
        if keg_for_cache and not c.get('kegDate'): c['kegDate'] = keg_for_cache
        if b.get('measuredBottlingSize') is not None: c['keggedVol'] = float(b['measuredBottlingSize'])
        if tank_for_cache: c['tank'] = tank_for_cache
        if tapped: c['dateTapped'] = tapped
        if kicked: c['dateKicked'] = kicked
        cache[str(no)] = c

    if added:
        history.sort(key=lambda h: (h.get('date') or '', h.get('batch') or 0))
    if conflicts:
        log(f'  {conflicts} new batch(es) left without a tank (lane tank busy) - assign in the dashboard')
    return added, updated


# ---------------------------------------------------------------- Brewfather fetch
def fetch_all(auth, session):
    """Cursor-paginated fetch per status (Brewfather v2 needs a status filter; complete=true adds the measurements array)."""
    out = []
    for status in ALL_STATUSES:
        last_id, pages = None, 0
        while True:
            pages += 1
            url = f'https://api.brewfather.app/v2/batches?status={status}&limit={PAGE}&complete=true'
            if last_id:
                url += f'&start_after={last_id}'
            r = session.get(url, auth=auth, timeout=30)
            r.raise_for_status()
            page = r.json()
            if not isinstance(page, list):
                raise RuntimeError(f'Unexpected response for {status}')
            out.extend(page)
            if len(page) < PAGE or not page[-1].get('_id') or pages >= 100:
                break
            last_id = page[-1]['_id']
        print(f'  {status}: fetched')
    return out


def main():
    import requests
    if not os.path.exists(DATA_FILE):
        print('brewery_data.json not found - nothing to do'); return 0
    with open(DATA_FILE, encoding='utf-8') as f:
        data = json.load(f)
    try:
        batches = fetch_all((os.environ['BF_USER_ID'], os.environ['BF_API_KEY']), requests.Session())
    except Exception as exc:                               # any failure -> change nothing
        print(f'WARNING: Brewfather fetch failed ({exc}). History import skipped, no changes made.'); return 0
    unique = dedupe(batches)
    if len(unique) < 10:
        print(f'WARNING: only {len(unique)} batches returned - skipping import to be safe.'); return 0
    before = json.dumps(data, sort_keys=True)
    added, updated = run(data, batches)
    if json.dumps(data, sort_keys=True) == before:
        print('History import: no changes.'); return 0
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
    print(f'History import done: {added} added, {updated} updated.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
