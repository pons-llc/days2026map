/* CD26 観覧アプリ */
(() => {
  'use strict';

  const D = window.CD26;
  const STORE_KEY = 'cd26-app-v1';
  const PREF_KEY = 'cd26-pref-v1';
  const SESSION_URL = 'https://c2026.smktg.jp/public/session/view/';
  const TIERS = { S: 'サクラスポンサー', F: 'フジスポンサー', T: 'ツバキスポンサー' };
  const CATS = ['kintone', 'Garoon', 'サイボウズ Office', '導入前の方向け', 'ご利用中の方向け', 'IT・DX全般', 'マネジメント', '連携サービス'];

  const sessionsById = new Map(D.sessions.map(s => [s.id, s]));
  const booths = D.booths.map(([code, name, x, y]) => ({ code, name, x, y, tier: code[0] }));
  const boothsByCode = new Map(booths.map(b => [b.code, b]));
  const pois = D.pois.map(([name, kind, x, y]) => ({ name, kind, x, y }));

  /* ---------- utils ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (id, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const norm = s => String(s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  const now = () => new Date().toISOString();
  const dayOf = date => D.days.find(d => d.date === date) || D.days[0];
  const overlap = (a, b) => a.date === b.date && toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end);

  /* ---------- state ---------- */
  const emptyState = () => ({ v: 1, selected: [], custom: [], sNotes: {}, booths: {}, contacts: [], updatedAt: null });

  function sanitize(raw) {
    const s = emptyState();
    if (!raw || typeof raw !== 'object') return s;
    if (Array.isArray(raw.selected)) s.selected = raw.selected.filter(id => typeof id === 'string');
    if (Array.isArray(raw.custom)) s.custom = raw.custom.filter(e => e && e.id && e.date && e.start && e.end).map(e => ({
      id: String(e.id), date: String(e.date), start: String(e.start), end: String(e.end),
      title: String(e.title || ''), place: String(e.place || ''), memo: String(e.memo || ''), updatedAt: e.updatedAt || null,
    }));
    if (raw.sNotes && typeof raw.sNotes === 'object') for (const [k, v] of Object.entries(raw.sNotes)) {
      if (v && typeof v === 'object') s.sNotes[k] = { text: String(v.text || ''), rating: Math.max(0, Math.min(5, Number(v.rating) || 0)), updatedAt: v.updatedAt || null };
    }
    if (raw.booths && typeof raw.booths === 'object') for (const [k, v] of Object.entries(raw.booths)) {
      if (v && typeof v === 'object') s.booths[k] = { fav: !!v.fav, visited: !!v.visited, memo: String(v.memo || ''), updatedAt: v.updatedAt || null };
    }
    if (Array.isArray(raw.contacts)) s.contacts = raw.contacts.filter(c => c && c.id).map(c => ({
      id: String(c.id), name: String(c.name || ''), company: String(c.company || ''), title: String(c.title || ''),
      email: String(c.email || ''), tel: String(c.tel || ''), booth: String(c.booth || ''), memo: String(c.memo || ''),
      createdAt: c.createdAt || null, updatedAt: c.updatedAt || null,
    }));
    s.updatedAt = raw.updatedAt || null;
    return s;
  }

  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  }
  let state = sanitize(load(STORE_KEY, null));
  const pref = Object.assign({ view: 'timetable', day: null, ttMode: 'mine', memoTab: 'sessions', cats: [], onlySel: false, mapPins: { fav: true, visited: true }, poiLabels: true }, load(PREF_KEY, {}));

  function save() {
    state.updatedAt = now();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch { snack('保存できませんでした（ストレージの空き容量を確認してください）'); }
  }
  function savePref() { try { localStorage.setItem(PREF_KEY, JSON.stringify(pref)); } catch { /* 表示設定のみ */ } }

  const boothState = code => state.booths[code] || { fav: false, visited: false, memo: '' };
  function setBooth(code, patch) {
    const cur = { ...boothState(code), ...patch, updatedAt: now() };
    if (!cur.fav && !cur.visited && !cur.memo) delete state.booths[code]; else state.booths[code] = cur;
    save();
  }
  const isSel = id => state.selected.includes(id);
  function toggleSel(id) {
    if (isSel(id)) state.selected = state.selected.filter(x => x !== id);
    else state.selected.push(id);
    save();
  }
  function myEvents(date) {
    const evs = state.selected.map(id => sessionsById.get(id)).filter(Boolean).map(s => ({ ...s, kind: 'session' }));
    for (const c of state.custom) evs.push({ ...c, kind: 'custom' });
    return evs.filter(e => !date || e.date === date).sort((a, b) => a.date.localeCompare(b.date) || toMin(a.start) - toMin(b.start));
  }
  function conflictsOf(ev) {
    return myEvents(ev.date).filter(o => o.id !== ev.id && overlap(o, ev));
  }

  /* ---------- snackbar ---------- */
  let snackTimer;
  function snack(msg) {
    const el = $('#snackbar');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(snackTimer);
    snackTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  /* ---------- bottom sheet ---------- */
  const sheet = $('#sheet');
  let sheetOnClose = null;
  function openSheet(html, onBind, onClose) {
    $('#sheetContent').innerHTML = html;
    $('#sheetContent').scrollTop = 0;
    sheetOnClose = onClose || null;
    if (!sheet.open) {
      sheet.showModal();
      history.pushState({ sheet: true }, '');
    }
    onBind && onBind($('#sheetContent'));
  }
  function closeSheet() {
    if (!sheet.open) return;
    if (history.state && history.state.sheet) history.back();
    else finishClose();
  }
  function finishClose() {
    if (!sheet.open) return;
    sheet.close();
    const cb = sheetOnClose; sheetOnClose = null;
    cb && cb();
  }
  window.addEventListener('popstate', () => { if (sheet.open) finishClose(); });
  sheet.addEventListener('cancel', e => { e.preventDefault(); closeSheet(); });
  sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
  const sheetHead = (title, extra = '') => `<div class="sheet-head"><h2 id="sheetTitle">${title}</h2>${extra}<button type="button" class="icon-btn" data-close aria-label="閉じる">${icon('close')}</button></div>`;
  $('#sheetContent').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });

  function confirmSheet(title, body, okLabel, danger = false) {
    return new Promise(resolve => {
      let result = false;
      openSheet(`${sheetHead(esc(title))}<p>${body}</p>
        <div class="btn-row"><button type="button" class="btn" data-close>キャンセル</button>
        <button type="button" class="btn ${danger ? 'danger' : 'primary'}" id="cfOk">${esc(okLabel)}</button></div>`,
      el => { $('#cfOk', el).onclick = () => { result = true; closeSheet(); }; },
      () => resolve(result));
    });
  }

  /* ---------- navigation ---------- */
  const views = ['timetable', 'map', 'memo', 'backup'];
  function showView(v) {
    if (!views.includes(v)) v = 'timetable';
    pref.view = v; savePref();
    for (const name of views) $('#view-' + name).classList.toggle('active', name === v);
    $$('.nav-item').forEach(b => { if (b.dataset.view === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    $('#appbarTitle').textContent = $('#view-' + v).dataset.title;
    $('#appbar').classList.remove('raised');
    render();
    if (v === 'map') initMap();
  }
  $$('.nav-item').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
  document.addEventListener('scroll', e => {
    if (e.target.classList && e.target.classList.contains('view-body')) $('#appbar').classList.toggle('raised', e.target.scrollTop > 4);
  }, true);

  function setFab(label, onClick) {
    const fab = $('#fab');
    if (!label) { fab.hidden = true; fab.onclick = null; return; }
    fab.hidden = false;
    $('#fabLabel').textContent = label;
    fab.onclick = onClick;
  }

  function render() {
    const v = pref.view;
    if (v === 'timetable') renderTimetable();
    else if (v === 'memo') renderMemo();
    else if (v === 'backup') renderBackup();
    else { setFab(null); refreshMapMarkers(); }
  }

  /* =========================================================
     タイムテーブル
     ========================================================= */
  function defaultDay() {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return D.days.some(d => d.date === iso) ? iso : D.days[0].date;
  }
  if (!pref.day || !D.days.some(d => d.date === pref.day)) pref.day = defaultDay();

  function renderTimetable() {
    $('#dayTabs').innerHTML = D.days.map(d => {
      const n = myEvents(d.date).length;
      return `<button type="button" role="tab" class="tab" data-day="${d.date}" aria-selected="${d.date === pref.day}">${d.label}<small>${d.sub}${n ? `・${n}件` : ''}</small></button>`;
    }).join('');
    $$('#dayTabs .tab').forEach(b => b.onclick = () => { pref.day = b.dataset.day; savePref(); renderTimetable(); $('#ttBody').scrollTop = 0; });
    $$('#view-timetable .seg').forEach(b => {
      b.setAttribute('aria-pressed', b.dataset.mode === pref.ttMode);
      b.onclick = () => { pref.ttMode = b.dataset.mode; savePref(); renderTimetable(); $('#ttBody').scrollTop = 0; };
    });
    const on = pref.notify && notifyPermission() === 'granted';
    $('#appbarActions').innerHTML = `
      <button type="button" class="icon-btn" id="abNotify" aria-pressed="${on}" aria-label="15分前リマインダー ${on ? 'オン' : 'オフ'}" title="15分前リマインダー">${icon(on ? 'bell' : 'bell-off')}</button>
      <button type="button" class="icon-btn" id="abIcs" aria-label="カレンダーに書き出し" title="カレンダーに書き出し（.ics）">${icon('cal-add')}</button>`;
    if (on) $('#abNotify').style.color = 'var(--blue-900)';
    $('#abNotify').onclick = openNotifySettings;
    $('#abIcs').onclick = exportIcs;
    setFab('予定を追加', () => openCustomEditor(null));
    if (pref.ttMode === 'mine') renderMine(); else renderList();
  }

  /* ---------- 15分前リマインダー ---------- */
  const REMIND_MIN = 15;
  const notifyPermission = () => ('Notification' in window ? Notification.permission : 'unsupported');
  const eventStartDate = e => new Date(`${e.date}T${e.start}:00+09:00`);

  function openNotifySettings() {
    const perm = notifyPermission();
    const on = pref.notify && perm === 'granted';
    openSheet(`${sheetHead('15分前リマインダー')}
      <p>マイ予定の開始${REMIND_MIN}分前に通知します。</p>
      <div class="warn-box">${icon('warning', 'ic-s')}<span>このアプリはサーバーを使わないため、通知が届くのは<strong>アプリを開いている間（バックグラウンドを含む）</strong>だけです。アプリを完全に閉じていても確実に知らせてほしい場合は、「カレンダーに書き出し」で端末のカレンダーに登録してください（${REMIND_MIN}分前アラーム付き）。</span></div>
      ${perm === 'unsupported' ? '<p class="hint">このブラウザは通知に対応していません。</p>' : ''}
      ${perm === 'denied' ? '<p class="hint">通知がブロックされています。ブラウザのサイト設定から通知を許可してください。</p>' : ''}
      <div class="btn-row">
        ${perm !== 'unsupported' && perm !== 'denied' ? `<button type="button" class="btn ${on ? '' : 'primary'}" id="nToggle">${icon(on ? 'bell-off' : 'bell')}${on ? 'リマインダーをオフ' : 'リマインダーをオン'}</button>` : ''}
        <button type="button" class="btn ${perm === 'granted' && on ? 'primary' : ''}" id="nIcs">${icon('cal-add')}カレンダーに書き出し</button>
      </div>
      ${on ? '<button type="button" class="btn text" id="nTest">テスト通知を送る</button>' : ''}`, el => {
      if ($('#nToggle', el)) $('#nToggle', el).onclick = async () => {
        if (on) { pref.notify = false; savePref(); snack('リマインダーをオフにしました'); }
        else {
          const p = await Notification.requestPermission();
          if (p !== 'granted') { snack('通知が許可されませんでした'); openNotifySettings(); return; }
          pref.notify = true; savePref(); snack('リマインダーをオンにしました'); checkReminders();
        }
        closeSheet(); render();
      };
      $('#nIcs', el).onclick = exportIcs;
      if ($('#nTest', el)) $('#nTest', el).onclick = () => notify('テスト通知', 'リマインダーは有効です。', 'cd26-test');
    });
  }

  async function notify(title, body, tag) {
    const opt = { body, tag, icon: 'img/icon-192.png', badge: 'img/icon-192.png', renotify: true };
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      if (reg) await reg.showNotification(title, opt);
      else new Notification(title, opt);
    } catch { /* 通知できない環境では何もしない */ }
  }

  function checkReminders() {
    if (!pref.notify || notifyPermission() !== 'granted') return;
    const sent = new Set(load('cd26-notified', []));
    const t = Date.now();
    for (const e of myEvents()) {
      const start = eventStartDate(e).getTime();
      const fireAt = start - REMIND_MIN * 60000;
      const key = `${e.id}@${e.date}T${e.start}`;
      // 通知時刻を過ぎていて、まだ開始していない予定だけ通知（開き直したときの取りこぼし対策も兼ねる）
      if (t >= fireAt && t < start && !sent.has(key)) {
        const mins = Math.max(1, Math.round((start - t) / 60000));
        const place = e.kind === 'custom' && e.place ? ` ・${e.place}` : '';
        notify(`まもなく開始（${mins}分後）`, `${e.start}〜 ${e.title}${place}`, key);
        sent.add(key);
      }
    }
    try { localStorage.setItem('cd26-notified', JSON.stringify([...sent].slice(-300))); } catch { /* noop */ }
  }

  /* ---------- カレンダー（.ics）書き出し ---------- */
  function exportIcs() {
    const evs = myEvents();
    if (!evs.length) { snack('マイ予定がありません'); return; }
    const fmt = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const txt = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    const fold = line => { const out = []; let cur = ''; for (const ch of line) { if (new TextEncoder().encode(cur + ch).length > 73) { out.push(cur); cur = ' ' + ch; } else cur += ch; } out.push(cur); return out.join('\r\n'); };
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pons LLC//CD26 Viewer//JA', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Cybozu Days 2026 マイ予定'];
    for (const e of evs) {
      const s = sessionsById.get(e.id);
      const desc = e.kind === 'session'
        ? [s.speakers.join(' / '), SESSION_URL + s.viewId, '※非公式アプリから書き出し。正式な情報は公式サイトをご確認ください。'].filter(Boolean).join('\n')
        : e.memo;
      lines.push('BEGIN:VEVENT', `UID:${e.id}-${e.date}@cd26.pons-llc.com`, `DTSTAMP:${fmt(new Date())}`,
        `DTSTART:${fmt(eventStartDate(e))}`, `DTEND:${fmt(new Date(`${e.date}T${e.end}:00+09:00`))}`,
        `SUMMARY:${txt(e.title)}`, `LOCATION:${txt(e.kind === 'custom' && e.place ? e.place + '（幕張メッセ）' : '幕張メッセ 4〜7ホール')}`,
        `DESCRIPTION:${txt(desc)}`,
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${txt(e.title)}`, `TRIGGER:-PT${REMIND_MIN}M`, 'END:VALARM', 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.map(fold).join('\r\n') + '\r\n'], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'cd26-my-schedule.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    snack(`${evs.length}件の予定を書き出しました（${REMIND_MIN}分前アラーム付き）`);
  }

  const PX = 1.5; // 1分あたりのpx
  function renderMine() {
    const body = $('#ttBody');
    const evs = myEvents(pref.day);
    if (!evs.length) {
      body.innerHTML = `<div class="empty">${icon('event')}<p>${esc(dayOf(pref.day).label)} の予定はまだありません。<br>セッション一覧から追加するか、ブースセミナーなどの予定を登録しましょう。</p>
        <button type="button" class="btn primary" id="goList">セッション一覧を見る</button></div>`;
      $('#goList').onclick = () => { pref.ttMode = 'list'; savePref(); renderTimetable(); };
      return;
    }
    let from = 9 * 60, to = 20 * 60;
    for (const e of evs) { from = Math.min(from, Math.floor(toMin(e.start) / 60) * 60); to = Math.max(to, Math.ceil(toMin(e.end) / 60) * 60); }

    // 重なり判定 → 列割り当て
    const items = evs.map(e => ({ e, s: toMin(e.start), t: Math.max(toMin(e.end), toMin(e.start) + 15), col: 0, cols: 1 }));
    let cluster = [], clusterEnd = -1;
    const flush = () => {
      const colEnds = [];
      for (const it of cluster) {
        let c = colEnds.findIndex(end => end <= it.s);
        if (c < 0) { c = colEnds.length; colEnds.push(0); }
        colEnds[c] = it.t; it.col = c;
      }
      for (const it of cluster) it.cols = colEnds.length;
      cluster = [];
    };
    for (const it of items) {
      if (it.s >= clusterEnd) { flush(); clusterEnd = it.t; }
      cluster.push(it); clusterEnd = Math.max(clusterEnd, it.t);
    }
    flush();

    let html = `<div class="timeline" style="height:${(to - from) * PX + 16}px">`;
    for (let m = from; m <= to; m += 60) html += `<div class="tl-hour" style="top:${(m - from) * PX}px"><span>${m / 60}:00</span></div>`;
    for (const it of items) {
      const e = it.e;
      const conflict = conflictsOf(e).length > 0;
      const top = (it.s - from) * PX, h = Math.max(28, (it.t - it.s) * PX - 3);
      const w = 100 / it.cols;
      html += `<button type="button" class="tl-ev ${e.kind === 'custom' ? 'custom' : ''} ${conflict ? 'conflict' : ''}" data-kind="${e.kind}" data-id="${esc(e.id)}"
        style="top:${top}px;height:${h}px;left:calc(${w * it.col}% + 2px);width:calc(${w}% - 4px)">
        <span class="t">${e.start}–${e.end}${e.kind === 'custom' && e.place ? '・' + esc(e.place) : ''}</span><b>${esc(e.title || '(無題)')}</b></button>`;
    }
    const n = new Date();
    const iso = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    const nm = n.getHours() * 60 + n.getMinutes();
    if (iso === pref.day && nm >= from && nm <= to) html += `<div class="tl-now" style="top:${(nm - from) * PX}px" aria-label="現在時刻"></div>`;
    html += '</div>';
    const conflicts = evs.filter(e => conflictsOf(e).length).length;
    body.innerHTML = (conflicts ? `<div class="warn-box">${icon('warning', 'ic-s')}<span>時間が重なっている予定があります（赤枠）。</span></div>` : '') + html;
    $$('.tl-ev', body).forEach(b => b.onclick = () => b.dataset.kind === 'custom' ? openCustomEditor(b.dataset.id) : openSession(b.dataset.id));
  }

  function renderList() {
    const body = $('#ttBody');
    body.innerHTML = `<label class="searchbar list-search">${icon('search')}<input type="search" id="ttSearch" placeholder="タイトル・登壇者で検索" value="${esc(pref.q || '')}"></label>
      <div class="chips" style="margin:0 -16px">
        <button type="button" class="chip" data-only aria-pressed="${pref.onlySel}">追加済みのみ</button>
        ${CATS.map(c => `<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="${pref.cats.includes(c)}">${esc(c)}</button>`).join('')}
      </div><div id="ttResults"></div>`;
    // 入力欄は作り直さない（日本語入力の変換が途切れないように結果だけ更新）
    $('#ttSearch').oninput = e => { pref.q = e.target.value; renderListResults(); };
    $('[data-only]', body).onclick = () => { pref.onlySel = !pref.onlySel; savePref(); renderList(); };
    $$('[data-cat]', body).forEach(b => b.onclick = () => {
      const c = b.dataset.cat;
      pref.cats = pref.cats.includes(c) ? pref.cats.filter(x => x !== c) : [...pref.cats, c];
      savePref(); renderList();
    });
    renderListResults();
  }

  function renderListResults() {
    const body = $('#ttResults');
    if (!body) return;
    const q = norm(pref.q || '');
    const list = D.sessions.filter(s => s.date === pref.day)
      .filter(s => !pref.onlySel || isSel(s.id))
      .filter(s => !pref.cats.length || pref.cats.some(c => s.cats.includes(c)))
      .filter(s => !q || norm(s.title + s.note + s.speakers.join('')).includes(q));
    let html = '';
    if (!list.length) html += `<div class="empty">${icon('search')}<p>条件に合うセッションがありません。</p></div>`;
    let slot = '';
    for (const s of list) {
      const key = s.start + '–' + s.end;
      if (key !== slot) {
        slot = key;
        const cnt = list.filter(x => x.start + '–' + x.end === key).length;
        html += `<h3 class="section-h">${key}<span class="count">${cnt}件</span></h3>`;
      }
      const sel = isSel(s.id);
      const conflict = sel && conflictsOf(s).length > 0;
      const note = state.sNotes[s.id];
      html += `<div class="card tappable" data-id="${s.id}" role="button" tabindex="0" style="${sel ? 'border-color:var(--blue-900);background:var(--blue-50)' : ''}">
        <div class="card-row"><div class="card-main">
          <div class="card-title clamp2">${esc(s.title)}</div>
          ${s.speakers.length ? `<div class="card-meta clamp1">${esc(s.speakers.join(' / '))}</div>` : ''}
          <div>${s.cats.map(c => `<span class="tag">${esc(c)}</span>`).join('')}${conflict ? `<span class="tag warn">時間重複</span>` : ''}${note && (note.text || note.rating) ? `<span class="tag ok">感想あり</span>` : ''}</div>
        </div>
        <button type="button" class="icon-btn star-btn" data-star="${s.id}" aria-pressed="${sel}" aria-label="${sel ? 'マイ予定から外す' : 'マイ予定に追加'}">${icon(sel ? 'star' : 'star-o')}</button></div></div>`;
    }
    html += `<p class="disclaimer">運営：合同会社Pons（非公式）｜正式な情報は<a href="${esc(D.sourceUrl)}" target="_blank" rel="noopener">公式サイト</a>をご確認ください</p>`;
    body.innerHTML = html;
    $$('.card[data-id]', body).forEach(card => {
      card.onclick = e => {
        const star = e.target.closest('[data-star]');
        if (star) { e.stopPropagation(); quickToggle(star.dataset.star); return; }
        openSession(card.dataset.id);
      };
      card.onkeydown = e => { if (e.key === 'Enter' && e.target === card) openSession(card.dataset.id); };
    });
  }

  function quickToggle(id) {
    toggleSel(id);
    const s = sessionsById.get(id);
    if (isSel(id)) {
      const c = conflictsOf(s);
      snack(c.length ? `追加しました（${c.length}件と時間が重なっています）` : 'マイ予定に追加しました');
    } else snack('マイ予定から外しました');
    renderTimetable();
  }

  function ratingHtml(r) {
    return `<div class="rating" role="group" aria-label="評価">${[1, 2, 3, 4, 5].map(i =>
      `<button type="button" data-rate="${i}" aria-pressed="${i <= r}" aria-label="${i}つ星">${icon(i <= r ? 'star' : 'star-o')}</button>`).join('')}</div>`;
  }

  function openSession(id) {
    const s = sessionsById.get(id);
    if (!s) return;
    const draw = () => {
      const sel = isSel(id);
      const note = state.sNotes[id] || { text: '', rating: 0 };
      const conflicts = sel ? conflictsOf(s) : myEvents(s.date).filter(o => overlap(o, s));
      openSheet(`${sheetHead(esc(s.title))}
        <div class="card-meta">${esc(dayOf(s.date).label)} ${esc(dayOf(s.date).sub)} ${s.start}–${s.end}</div>
        <div>${s.cats.map(c => `<span class="tag blue">${esc(c)}</span>`).join('')}</div>
        ${conflicts.length ? `<div class="warn-box">${icon('warning', 'ic-s')}<span>${sel ? '時間が重なる予定' : 'マイ予定と時間が重なります'}：${conflicts.map(c => esc(c.title)).join('、')}</span></div>` : ''}
        <div class="toggle-row">
          <button type="button" class="btn" id="sSel" aria-pressed="${sel}">${icon(sel ? 'star' : 'star-o')}${sel ? 'マイ予定に追加済み' : 'マイ予定に追加'}</button>
        </div>
        ${s.note ? `<p class="lead">${esc(s.note)}</p>` : ''}
        ${s.speakers.length ? `<h3 class="section-h">登壇者</h3><ul class="speakers">${s.speakers.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
        <a class="btn text" href="${SESSION_URL}${encodeURIComponent(s.viewId)}" target="_blank" rel="noopener">${icon('open')}公式サイトで詳細を見る</a>
        <p class="disclaimer" style="text-align:left;padding-top:4px">※非公式アプリです。会場・時間などの正式な情報は公式サイトでご確認ください。</p>
        <h3 class="section-h">感想メモ</h3>
        ${ratingHtml(note.rating)}
        <label class="field"><span class="sr">感想</span><textarea id="sNote" placeholder="気づき・学び・次のアクションなど">${esc(note.text)}</textarea></label>
        <div class="saved" id="sSaved"></div>`,
      el => {
        $('#sSel', el).onclick = () => { toggleSel(id); draw(); render(); };
        const saveNote = (patch) => {
          const cur = { ...(state.sNotes[id] || { text: '', rating: 0 }), ...patch, updatedAt: now() };
          if (!cur.text && !cur.rating) delete state.sNotes[id]; else state.sNotes[id] = cur;
          save();
          $('#sSaved', el).textContent = '保存しました';
        };
        $$('[data-rate]', el).forEach(b => b.onclick = () => {
          const cur = (state.sNotes[id] || {}).rating || 0;
          const r = Number(b.dataset.rate);
          saveNote({ rating: cur === r ? 0 : r });
          $$('[data-rate]', el).forEach(x => {
            const on = Number(x.dataset.rate) <= state.sNotes[id]?.rating;
            x.setAttribute('aria-pressed', !!on); x.innerHTML = icon(on ? 'star' : 'star-o');
          });
        });
        let t;
        $('#sNote', el).oninput = e => { clearTimeout(t); t = setTimeout(() => saveNote({ text: e.target.value }), 400); };
        $('#sNote', el).onblur = e => { clearTimeout(t); saveNote({ text: e.target.value }); };
      }, render);
    };
    draw();
  }

  const placeOptions = () => [
    ...booths.map(b => `${b.code} ${b.name}`),
    ...pois.map(p => p.name),
  ].map(v => `<option value="${esc(v)}">`).join('');

  function openCustomEditor(id) {
    const ev = id ? state.custom.find(c => c.id === id) : null;
    const e = ev || { date: pref.day, start: '13:00', end: '13:30', title: '', place: '', memo: '' };
    const placeBooth = findPlace(e.place);
    openSheet(`${sheetHead(ev ? '予定を編集' : '予定を追加')}
      <form id="cForm">
        <label class="field"><span>タイトル（必須）</span><input name="title" required value="${esc(e.title)}" placeholder="例：ブースセミナー、ランチ、打ち合わせ"></label>
        <label class="field"><span>日付</span><select name="date">${D.days.map(d => `<option value="${d.date}" ${d.date === e.date ? 'selected' : ''}>${d.label} ${d.sub}</option>`).join('')}</select></label>
        <div class="field-row">
          <label class="field"><span>開始</span><input type="time" name="start" required value="${esc(e.start)}" step="300"></label>
          <label class="field"><span>終了</span><input type="time" name="end" required value="${esc(e.end)}" step="300"></label>
        </div>
        <label class="field"><span>場所</span><input name="place" list="placeList" value="${esc(e.place)}" placeholder="ブース番号・ステージ名など"><datalist id="placeList">${placeOptions()}</datalist></label>
        <label class="field"><span>メモ・感想</span><textarea name="memo">${esc(e.memo)}</textarea></label>
        <p class="hint" id="cErr" role="alert"></p>
        <div class="btn-row">
          ${ev ? `<button type="button" class="btn danger" id="cDel">${icon('delete')}削除</button>` : ''}
          ${placeBooth ? `<button type="button" class="btn" id="cMap">${icon('place')}マップ</button>` : ''}
          <button type="submit" class="btn primary">保存</button>
        </div>
      </form>`, el => {
      const f = $('#cForm', el);
      f.onsubmit = ev2 => {
        ev2.preventDefault();
        const v = Object.fromEntries(new FormData(f));
        if (toMin(v.end) <= toMin(v.start)) { $('#cErr', el).textContent = '終了時刻は開始時刻より後にしてください。'; return; }
        const item = { id: ev ? ev.id : 'c-' + uid(), date: v.date, start: v.start, end: v.end, title: v.title.trim(), place: v.place.trim(), memo: v.memo, updatedAt: now() };
        if (ev) Object.assign(ev, item); else state.custom.push(item);
        save(); pref.day = item.date; savePref();
        closeSheet(); snack('保存しました'); render();
      };
      if (ev) $('#cDel', el).onclick = async () => {
        if (await confirmSheet('予定を削除', `「${esc(ev.title)}」を削除しますか？`, '削除', true)) {
          state.custom = state.custom.filter(c => c.id !== ev.id); save(); snack('削除しました'); render();
        }
      };
      if (placeBooth) $('#cMap', el).onclick = () => { closeSheet(); focusPlace(placeBooth); };
    });
  }

  function findPlace(text) {
    if (!text) return null;
    const m = text.normalize('NFKC').match(/([SFT])\s*-?\s*(\d{1,2})/i);
    if (m) { const b = boothsByCode.get(`${m[1].toUpperCase()}-${m[2].padStart(2, '0')}`); if (b) return { booth: b }; }
    const p = pois.find(p => norm(text).includes(norm(p.name).replace(/^[①-⑩]/, '')));
    return p ? { poi: p } : null;
  }

  /* =========================================================
     マップ（Leaflet / CRS.Simple に会場PDFを画像として重ねる）
     ========================================================= */
  const [MW, MH] = D.mapSize;
  const ll = (x, y) => [MH - y, x];
  let map = null, pinLayer, poiLayer, focusLayer;
  const hitByCode = new Map();

  function initMap() {
    if (map) { setTimeout(() => map.invalidateSize(), 0); return; }
    map = L.map('map', {
      crs: L.CRS.Simple, minZoom: -3, maxZoom: 2, zoomSnap: 0.25, zoomDelta: 0.5,
      attributionControl: false, zoomControl: false, maxBoundsViscosity: 0.8,
    });
    const bounds = [[0, 0], [MH, MW]];
    L.imageOverlay('img/map.jpg', bounds).addTo(map);
    map.setMaxBounds([[-100, -100], [MH + 100, MW + 100]]);
    fitHall();
    map.setMinZoom(map.getBoundsZoom(bounds) - 0.5);

    for (const b of booths) {
      const r = b.tier === 'S' ? 24 : 13;
      const c = L.circle(ll(b.x, b.y), { radius: r, stroke: false, fillOpacity: 0, className: 'booth-hit' }).addTo(map);
      c.on('click', () => openBooth(b.code));
      hitByCode.set(b.code, c);
    }
    poiLayer = L.layerGroup().addTo(map);
    for (const p of pois) {
      const m = L.circle(ll(p.x, p.y), { radius: 22, stroke: false, fillOpacity: 0, className: 'booth-hit' }).addTo(poiLayer);
      m.bindTooltip(p.name, { direction: 'top', className: 'map-label' });
      m.on('click', () => openPoi(p));
    }
    pinLayer = L.layerGroup().addTo(map);
    focusLayer = L.layerGroup().addTo(map);
    refreshMapMarkers();
    setTimeout(() => map.invalidateSize(), 0);
  }
  function fitHall() { map.fitBounds([ll(420, 940), ll(1660, 60)]); }

  function refreshMapMarkers() {
    renderMapChips();
    if (!map) return;
    pinLayer.clearLayers();
    for (const [code, st] of Object.entries(state.booths)) {
      const b = boothsByCode.get(code);
      if (!b) continue;
      const showFav = st.fav && pref.mapPins.fav, showVis = st.visited && pref.mapPins.visited;
      if (!showFav && !showVis) continue;
      const cls = showFav && showVis ? 'both' : showFav ? 'fav' : 'visited';
      const html = `<div class="pin-icon ${cls}" style="width:20px;height:20px">${showVis ? '✓' : '★'}</div>`;
      const off = b.tier === 'S' ? 18 : 10;
      L.marker(ll(b.x + off, b.y - off), { icon: L.divIcon({ html, className: '', iconSize: [20, 20] }), keyboard: false })
        .on('click', () => openBooth(code)).addTo(pinLayer);
    }
  }

  function renderMapChips() {
    const favN = Object.values(state.booths).filter(b => b.fav).length;
    const visN = Object.values(state.booths).filter(b => b.visited).length;
    $('#mapChips').innerHTML = `
      <button type="button" class="chip" data-pin="fav" aria-pressed="${pref.mapPins.fav}">★ お気に入り ${favN}</button>
      <button type="button" class="chip" data-pin="visited" aria-pressed="${pref.mapPins.visited}">訪問済み ${visN}/${booths.length}</button>`;
    $$('#mapChips [data-pin]').forEach(b => b.onclick = () => { pref.mapPins[b.dataset.pin] = !pref.mapPins[b.dataset.pin]; savePref(); refreshMapMarkers(); });
  }

  function focusPlace(place) {
    showView('map');
    const target = place.booth || place.poi;
    setTimeout(() => {
      map.invalidateSize();
      map.flyTo(ll(target.x, target.y), 0.75, { duration: 0.6 });
      focusLayer.clearLayers();
      const size = place.booth && place.booth.tier !== 'S' ? 44 : 72;
      L.marker(ll(target.x, target.y), { icon: L.divIcon({ html: `<div class="pulse" style="width:${size}px;height:${size}px"></div>`, className: '', iconSize: [size, size] }), interactive: false }).addTo(focusLayer);
      setTimeout(() => focusLayer.clearLayers(), 6000);
    }, 50);
  }

  // 検索
  const searchInput = $('#mapSearch'), suggest = $('#mapSuggest');
  function searchPlaces(qRaw) {
    const q = norm(qRaw);
    if (!q) return [];
    const codeQ = qRaw.normalize('NFKC').trim().match(/^([sft])\s*-?\s*(\d{1,2})$/i);
    const res = [];
    for (const b of booths) {
      if ((codeQ && b.code === `${codeQ[1].toUpperCase()}-${codeQ[2].padStart(2, '0')}`) || norm(b.code).includes(q) || norm(b.name).includes(q)) res.push({ booth: b });
    }
    for (const p of pois) if (norm(p.name).includes(q)) res.push({ poi: p });
    return res.slice(0, 30);
  }
  searchInput.addEventListener('input', () => {
    const res = searchPlaces(searchInput.value);
    if (!searchInput.value.trim()) { suggest.hidden = true; return; }
    suggest.innerHTML = res.length ? res.map((r, i) => r.booth
      ? `<li><button type="button" data-i="${i}"><span class="booth-code ${r.booth.tier}">${r.booth.code}</span><span>${esc(r.booth.name)}</span></button></li>`
      : `<li><button type="button" data-i="${i}">${icon('place')}<span>${esc(r.poi.name)}</span></button></li>`).join('')
      : '<li class="empty" style="padding:16px">見つかりませんでした</li>';
    suggest.hidden = false;
    $$('button', suggest).forEach(btn => btn.onclick = () => {
      const r = res[Number(btn.dataset.i)];
      suggest.hidden = true; searchInput.blur();
      focusPlace(r);
      if (r.booth) setTimeout(() => openBooth(r.booth.code), 700);
    });
  });
  searchInput.addEventListener('keydown', e => { if (e.key === 'Escape') { searchInput.value = ''; suggest.hidden = true; } });
  document.addEventListener('click', e => { if (!e.target.closest('.map-search')) suggest.hidden = true; });
  $('#mapFit').onclick = () => map && fitHall();
  $('#mapList').onclick = () => openBoothList('all');

  function openPoi(p) {
    openSheet(`${sheetHead(esc(p.name))}<p class="hint">会場内のスポットです。予定の「場所」に設定するとタイムテーブルからマップを開けます。</p>
      <div class="btn-row"><button type="button" class="btn primary" id="pAdd">${icon('add')}ここで予定を追加</button></div>`, el => {
      $('#pAdd', el).onclick = () => openCustomEditorWith({ place: p.name });
    });
  }
  function openCustomEditorWith(patch) {
    openCustomEditor(null);
    const f = $('#cForm');
    if (f && patch.place) f.elements.place.value = patch.place;
    if (f && patch.title) f.elements.title.value = patch.title;
  }

  function openBooth(code) {
    const b = boothsByCode.get(code);
    if (!b) return;
    const draw = () => {
      const st = boothState(code);
      const related = state.contacts.filter(c => c.booth === code);
      openSheet(`${sheetHead(esc(b.name))}
        <div class="card-row" style="align-items:center"><span class="booth-code ${b.tier}">${b.code}</span><span class="card-meta">${TIERS[b.tier]}</span></div>
        <div class="toggle-row">
          <button type="button" class="btn fav" id="bFav" aria-pressed="${st.fav}">${icon(st.fav ? 'star' : 'star-o')}お気に入り</button>
          <button type="button" class="btn visit" id="bVis" aria-pressed="${st.visited}">${icon(st.visited ? 'check' : 'check-o')}訪問済み</button>
        </div>
        <label class="field"><span>ブースメモ</span><textarea id="bMemo" placeholder="聞いた内容、資料、次のアクションなど">${esc(st.memo)}</textarea></label>
        <div class="saved" id="bSaved"></div>
        <h3 class="section-h">連絡先 <span class="count">${related.length}件</span></h3>
        ${related.map(contactCard).join('')}
        <div class="btn-row">
          <button type="button" class="btn" id="bContact">${icon('person')}連絡先を追加</button>
          <button type="button" class="btn" id="bSeminar">${icon('event')}予定に追加</button>
          ${pref.view !== 'map' ? `<button type="button" class="btn" id="bMap">${icon('place')}マップで表示</button>` : ''}
        </div>`, el => {
        $('#bFav', el).onclick = () => { setBooth(code, { fav: !boothState(code).fav }); draw(); };
        $('#bVis', el).onclick = () => { setBooth(code, { visited: !boothState(code).visited }); draw(); };
        let t;
        const saveMemo = v => { setBooth(code, { memo: v }); $('#bSaved', el).textContent = '保存しました'; };
        $('#bMemo', el).oninput = e => { clearTimeout(t); t = setTimeout(() => saveMemo(e.target.value), 400); };
        $('#bMemo', el).onblur = e => { clearTimeout(t); if (e.target.value !== boothState(code).memo) saveMemo(e.target.value); };
        $('#bContact', el).onclick = () => openContactEditor(null, { booth: code, company: b.name });
        $('#bSeminar', el).onclick = () => openCustomEditorWith({ place: `${b.code} ${b.name}`, title: `ブースセミナー（${b.name}）` });
        if ($('#bMap', el)) $('#bMap', el).onclick = () => { closeSheet(); focusPlace({ booth: b }); };
        bindContactCards(el);
      }, render);
    };
    draw();
  }

  function boothListHtml(filter) {
    const list = booths.filter(b => {
      const st = boothState(b.code);
      if (filter === 'fav') return st.fav;
      if (filter === 'visited') return st.visited;
      if (filter === 'unvisited') return !st.visited;
      if (filter === 'memo') return st.memo || st.fav || st.visited;
      return true;
    });
    if (!list.length) return `<div class="empty"><p>該当するブースはありません。</p></div>`;
    let html = '', tier = '';
    for (const b of list) {
      if (b.tier !== tier) { tier = b.tier; html += `<h3 class="section-h">${TIERS[tier]}<span class="count">${list.filter(x => x.tier === tier).length}件</span></h3>`; }
      const st = boothState(b.code);
      html += `<button type="button" class="card" data-booth="${b.code}"><div class="card-row" style="align-items:center">
        <span class="booth-code ${b.tier}">${b.code}</span>
        <div class="card-main"><div class="clamp2" style="font-weight:500;line-height:1.5">${esc(b.name)}</div>
        ${st.memo ? `<div class="card-meta clamp1">${esc(st.memo)}</div>` : ''}</div>
        ${st.fav ? `<span class="mini-stars" aria-label="お気に入り">★</span>` : ''}
        ${st.visited ? `<span class="tag ok">訪問済</span>` : ''}
      </div></button>`;
    }
    return html;
  }

  function openBoothList(filter) {
    const filters = [['all', 'すべて'], ['fav', 'お気に入り'], ['visited', '訪問済み'], ['unvisited', '未訪問']];
    openSheet(`${sheetHead('ブース一覧')}
      <div class="chips" style="margin:0 -20px;padding-left:20px">${filters.map(([k, l]) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${k === filter}">${l}</button>`).join('')}</div>
      ${boothListHtml(filter)}`, el => {
      $$('[data-f]', el).forEach(b => b.onclick = () => openBoothList(b.dataset.f));
      $$('[data-booth]', el).forEach(b => b.onclick = () => { const bb = boothsByCode.get(b.dataset.booth); focusPlace({ booth: bb }); openBooth(bb.code); });
    });
  }

  /* =========================================================
     メモ
     ========================================================= */
  function renderMemo() {
    $$('#memoTabs .tab').forEach(b => {
      b.setAttribute('aria-selected', b.dataset.memo === pref.memoTab);
      b.onclick = () => { pref.memoTab = b.dataset.memo; savePref(); renderMemo(); $('#memoBody').scrollTop = 0; };
    });
    $('#appbarActions').innerHTML = '';
    const body = $('#memoBody');
    if (pref.memoTab === 'sessions') {
      setFab('予定を追加', () => openCustomEditor(null));
      const items = [];
      for (const s of D.sessions) {
        const n = state.sNotes[s.id];
        if (n && (n.text || n.rating)) items.push({ kind: 'session', s, n });
        else if (isSel(s.id)) items.push({ kind: 'session', s, n: null });
      }
      for (const c of state.custom) items.push({ kind: 'custom', s: c, n: c.memo ? { text: c.memo } : null });
      items.sort((a, b) => a.s.date.localeCompare(b.s.date) || toMin(a.s.start) - toMin(b.s.start));
      if (!items.length) {
        body.innerHTML = `<div class="empty">${icon('note')}<p>セッションを「マイ予定」に追加すると、ここで感想を書けます。</p></div>`;
        return;
      }
      let html = '', day = '';
      for (const it of items) {
        if (it.s.date !== day) { day = it.s.date; html += `<h3 class="section-h">${dayOf(day).label} ${dayOf(day).sub}</h3>`; }
        const n = it.n;
        html += `<button type="button" class="card" data-kind="${it.kind}" data-id="${esc(it.s.id)}">
          <div class="card-meta">${it.s.start}–${it.s.end}${it.kind === 'custom' ? '・自分の予定' : ''} ${n && n.rating ? `<span class="mini-stars">${'★'.repeat(n.rating)}${'☆'.repeat(5 - n.rating)}</span>` : ''}</div>
          <div class="card-title clamp2">${esc(it.s.title)}</div>
          ${n && n.text ? `<div class="memo-excerpt clamp2">${esc(n.text)}</div>` : `<div class="card-meta">感想は未入力です</div>`}
        </button>`;
      }
      body.innerHTML = html;
      $$('[data-kind]', body).forEach(b => b.onclick = () => b.dataset.kind === 'custom' ? openCustomEditor(b.dataset.id) : openSession(b.dataset.id));
    } else if (pref.memoTab === 'booths') {
      setFab(null);
      const vals = Object.values(state.booths);
      const vis = vals.filter(v => v.visited).length;
      body.innerHTML = `<div class="stat-grid">
          <div class="stat"><b>${vis}<small style="font-size:.875rem;color:var(--text-sub)"> / ${booths.length}</small></b><span>訪問済みブース</span></div>
          <div class="stat"><b>${vals.filter(v => v.fav).length}</b><span>お気に入り</span></div>
          <div class="stat"><b>${vals.filter(v => v.memo).length}</b><span>メモあり</span></div>
        </div>
        <div class="progress" aria-hidden="true"><i style="width:${(vis / booths.length) * 100}%"></i></div>
        ${vals.length ? boothListHtml('memo') : `<div class="empty">${icon('map')}<p>マップでブースをタップして、お気に入り・訪問済み・メモを記録しましょう。</p><button type="button" class="btn primary" id="goMap">マップを開く</button></div>`}`;
      if ($('#goMap')) $('#goMap').onclick = () => showView('map');
      $$('[data-booth]', body).forEach(b => b.onclick = () => openBooth(b.dataset.booth));
    } else {
      setFab('連絡先を追加', () => openContactEditor(null));
      const list = [...state.contacts].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      body.innerHTML = list.length
        ? `<p class="hint">${list.length}件の連絡先</p>${list.map(contactCard).join('')}`
        : `<div class="empty">${icon('person')}<p>名刺交換した方や、ブースで話した担当者の連絡先を登録できます。</p></div>`;
      bindContactCards(body);
    }
  }

  function contactCard(c) {
    const b = boothsByCode.get(c.booth);
    return `<div class="card tappable" data-contact="${esc(c.id)}" role="button" tabindex="0">
      <div class="card-row"><div class="card-main">
        <div class="card-title">${esc(c.name || '(名前未入力)')}</div>
        <div class="card-meta">${esc([c.company, c.title].filter(Boolean).join('・'))}</div>
        ${b ? `<div><span class="booth-code ${b.tier}" style="height:20px;min-width:40px">${b.code}</span></div>` : ''}
        ${c.memo ? `<div class="memo-excerpt clamp2">${esc(c.memo)}</div>` : ''}
        <div class="contact-actions">
          ${c.tel ? `<a href="tel:${esc(c.tel.replace(/[^\d+]/g, ''))}">${icon('phone', 'ic-s')}電話</a>` : ''}
          ${c.email ? `<a href="mailto:${esc(c.email)}">${icon('mail', 'ic-s')}メール</a>` : ''}
        </div>
      </div>${icon('edit', 'ic-s')}</div></div>`;
  }
  function bindContactCards(root) {
    $$('[data-contact]', root).forEach(card => {
      card.onclick = e => { if (e.target.closest('a')) return; openContactEditor(card.dataset.contact); };
      card.onkeydown = e => { if (e.key === 'Enter' && e.target === card) openContactEditor(card.dataset.contact); };
    });
  }

  function openContactEditor(id, preset = {}) {
    const c0 = id ? state.contacts.find(c => c.id === id) : null;
    const c = c0 || { name: '', company: '', title: '', email: '', tel: '', booth: '', memo: '', ...preset };
    openSheet(`${sheetHead(c0 ? '連絡先を編集' : '連絡先を追加')}
      <form id="ctForm" autocomplete="off">
        <label class="field"><span>氏名</span><input name="name" value="${esc(c.name)}" autocomplete="name"></label>
        <label class="field"><span>会社名</span><input name="company" value="${esc(c.company)}" list="companyList"><datalist id="companyList">${booths.map(b => `<option value="${esc(b.name)}">`).join('')}</datalist></label>
        <label class="field"><span>部署・役職</span><input name="title" value="${esc(c.title)}"></label>
        <label class="field"><span>メールアドレス</span><input type="email" name="email" value="${esc(c.email)}" inputmode="email"></label>
        <label class="field"><span>電話番号</span><input type="tel" name="tel" value="${esc(c.tel)}" inputmode="tel"></label>
        <label class="field"><span>関連ブース</span><select name="booth"><option value="">なし</option>${booths.map(b => `<option value="${b.code}" ${b.code === c.booth ? 'selected' : ''}>${b.code} ${esc(b.name)}</option>`).join('')}</select></label>
        <label class="field"><span>メモ</span><textarea name="memo" placeholder="話した内容、フォローアップ予定など">${esc(c.memo)}</textarea></label>
        <p class="hint" id="ctErr" role="alert"></p>
        <div class="btn-row">
          ${c0 ? `<button type="button" class="btn danger" id="ctDel">${icon('delete')}削除</button>` : ''}
          <button type="submit" class="btn primary">保存</button>
        </div>
      </form>`, el => {
      const f = $('#ctForm', el);
      const fe = f.elements;
      fe.company.addEventListener('change', () => {
        if (fe.booth.value) return;
        const b = booths.find(b => b.name === fe.company.value);
        if (b) fe.booth.value = b.code;
      });
      f.onsubmit = e => {
        e.preventDefault();
        const v = Object.fromEntries(new FormData(f));
        for (const k in v) v[k] = typeof v[k] === 'string' ? v[k].trim() : v[k];
        if (!v.name && !v.company) { $('#ctErr', el).textContent = '氏名か会社名のどちらかを入力してください。'; return; }
        if (c0) Object.assign(c0, v, { updatedAt: now() });
        else state.contacts.push({ id: 'p-' + uid(), ...v, createdAt: now(), updatedAt: now() });
        save(); closeSheet(); snack('連絡先を保存しました'); render();
      };
      if (c0) $('#ctDel', el).onclick = async () => {
        if (await confirmSheet('連絡先を削除', `「${esc(c0.name || c0.company)}」を削除しますか？`, '削除', true)) {
          state.contacts = state.contacts.filter(x => x.id !== c0.id); save(); snack('削除しました'); render();
        }
      };
    });
  }

  /* =========================================================
     バックアップ
     ========================================================= */
  const counts = s => ({
    sessions: s.selected.length, custom: s.custom.length,
    notes: Object.values(s.sNotes).filter(n => n.text || n.rating).length + s.custom.filter(c => c.memo).length,
    booths: Object.keys(s.booths).length, contacts: s.contacts.length,
  });
  const countsText = c => `マイ予定 ${c.sessions + c.custom}件 / 感想 ${c.notes}件 / ブース記録 ${c.booths}件 / 連絡先 ${c.contacts}件`;

  function backupPayload() {
    return { app: 'cd26-viewer', format: 1, exportedAt: now(), data: state };
  }
  function backupName() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `cd26-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
  }

  function renderBackup() {
    setFab(null);
    $('#appbarActions').innerHTML = '';
    const c = counts(state);
    const last = load('cd26-last-backup', null);
    $('#backupBody').innerHTML = `
      <div class="stat-grid">
        <div class="stat"><b>${c.sessions + c.custom}</b><span>マイ予定</span></div>
        <div class="stat"><b>${c.notes}</b><span>感想メモ</span></div>
        <div class="stat"><b>${c.booths}</b><span>ブース記録</span></div>
        <div class="stat"><b>${c.contacts}</b><span>連絡先</span></div>
      </div>
      <div class="info-box">データはこの端末のブラウザ内（ローカルストレージ）だけに保存されています。機種変更やブラウザのデータ削除に備えて、定期的に書き出してください。${last ? `<br>前回の書き出し：${esc(new Date(last).toLocaleString('ja-JP'))}` : ''}</div>

      <h3 class="section-h">書き出し</h3>
      <div class="btn-row">
        <button type="button" class="btn primary" id="bkDl">${icon('download')}ファイルに保存</button>
        ${navigator.canShare ? `<button type="button" class="btn" id="bkShare">${icon('share')}共有</button>` : ''}
        <button type="button" class="btn" id="bkCopy">${icon('copy')}コピー</button>
      </div>

      <h3 class="section-h">復元</h3>
      <p class="hint" style="margin-top:0">書き出したファイル、またはコピーしたテキストからデータを復元します。</p>
      <div class="btn-row">
        <button type="button" class="btn" id="bkFile">${icon('upload')}ファイルから復元</button>
        <button type="button" class="btn" id="bkPaste">${icon('note')}テキストから復元</button>
      </div>
      <input type="file" id="bkInput" accept="application/json,.json,text/plain" hidden>

      <h3 class="section-h">データ管理</h3>
      <div class="btn-row"><button type="button" class="btn danger" id="bkClear">${icon('delete')}すべてのデータを削除</button></div>

      <h3 class="section-h">このアプリについて</h3>
      <div class="info-box">
        本アプリは <a href="https://pons-llc.com" target="_blank" rel="noopener">合同会社Pons</a> が運営する<strong>非公式</strong>の観覧補助アプリです。Cybozu Days 2026 の主催者・公式サイトとは関係ありません。<br>
        掲載しているセッション・ブース情報は公開資料をもとに作成したもので、変更や誤りが含まれる場合があります。<strong>正式な情報は必ず<a href="${esc(D.sourceUrl)}" target="_blank" rel="noopener">公式サイト</a>をご確認ください。</strong>
      </div>
      <p class="hint">入力したデータは運営者のサーバーには送信されず、この端末内にのみ保存されます。ホーム画面に追加すると、オフラインでも利用できます。<br>運営：合同会社Pons（<a href="https://pons-llc.com" target="_blank" rel="noopener">pons-llc.com</a>）</p>`;

    $('#bkDl').onclick = () => {
      const blob = new Blob([JSON.stringify(backupPayload(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = backupName();
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      markBackup(); snack('バックアップを書き出しました');
    };
    if ($('#bkShare')) $('#bkShare').onclick = async () => {
      const file = new File([JSON.stringify(backupPayload(), null, 2)], backupName(), { type: 'application/json' });
      try {
        if (navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'CD26 バックアップ' });
        else await navigator.share({ title: 'CD26 バックアップ', text: JSON.stringify(backupPayload()) });
        markBackup();
      } catch (e) { if (e.name !== 'AbortError') snack('共有できませんでした'); }
    };
    $('#bkCopy').onclick = async () => {
      try { await navigator.clipboard.writeText(JSON.stringify(backupPayload())); markBackup(); snack('クリップボードにコピーしました'); }
      catch { snack('コピーできませんでした'); }
    };
    $('#bkFile').onclick = () => $('#bkInput').click();
    $('#bkInput').onchange = async e => {
      const f = e.target.files[0]; e.target.value = '';
      if (f) importText(await f.text());
    };
    $('#bkPaste').onclick = () => openSheet(`${sheetHead('テキストから復元')}
      <label class="field"><span>バックアップのテキスト</span><textarea id="pasteArea" placeholder='{"app":"cd26-viewer", ...}'></textarea></label>
      <div class="btn-row"><button type="button" class="btn primary" id="pasteGo">読み込む</button></div>`, el => {
      $('#pasteGo', el).onclick = () => importText($('#pasteArea', el).value);
    });
    $('#bkClear').onclick = async () => {
      if (await confirmSheet('すべてのデータを削除', 'マイ予定・感想・ブース記録・連絡先をすべて削除します。元に戻せません。先にバックアップを書き出すことをおすすめします。', '削除する', true)) {
        state = emptyState(); save(); snack('すべてのデータを削除しました'); render();
      }
    };
  }
  function markBackup() { try { localStorage.setItem('cd26-last-backup', JSON.stringify(now())); } catch { /* noop */ } renderBackup(); }

  function importText(text) {
    let parsed;
    try { parsed = JSON.parse(text); } catch { snack('バックアップの形式が正しくありません'); return; }
    const raw = parsed && parsed.app === 'cd26-viewer' ? parsed.data : parsed;
    if (!raw || typeof raw !== 'object' || !('selected' in raw || 'booths' in raw || 'contacts' in raw)) { snack('このアプリのバックアップではありません'); return; }
    const incoming = sanitize(raw);
    const when = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString('ja-JP') : '不明';
    openSheet(`${sheetHead('バックアップを復元')}
      <div class="info-box">書き出し日時：${esc(when)}<br>${esc(countsText(counts(incoming)))}</div>
      <p class="hint">「統合」は今のデータを残したまま追加します（同じ項目は新しい方を採用）。「置き換え」は今のデータを消してバックアップの内容にします。</p>
      <div class="btn-row">
        <button type="button" class="btn" id="imMerge">統合する</button>
        <button type="button" class="btn danger" id="imReplace">置き換える</button>
      </div>`, el => {
      $('#imMerge', el).onclick = () => { state = mergeStates(state, incoming); save(); closeSheet(); snack('データを統合しました'); render(); };
      $('#imReplace', el).onclick = () => { state = incoming; save(); closeSheet(); snack('データを復元しました'); render(); };
    });
  }

  function mergeStates(a, b) {
    const newer = (x, y) => (!x ? y : !y ? x : (y.updatedAt || '') > (x.updatedAt || '') ? y : x);
    const out = emptyState();
    out.selected = [...new Set([...a.selected, ...b.selected])];
    const byId = (xs, ys) => { const m = new Map(xs.map(x => [x.id, x])); for (const y of ys) m.set(y.id, newer(m.get(y.id), y)); return [...m.values()]; };
    out.custom = byId(a.custom, b.custom);
    out.contacts = byId(a.contacts, b.contacts);
    for (const k of new Set([...Object.keys(a.sNotes), ...Object.keys(b.sNotes)])) out.sNotes[k] = newer(a.sNotes[k], b.sNotes[k]);
    for (const k of new Set([...Object.keys(a.booths), ...Object.keys(b.booths)])) out.booths[k] = newer(a.booths[k], b.booths[k]);
    return out;
  }

  /* ---------- 他タブでの変更を反映 ---------- */
  window.addEventListener('storage', e => {
    if (e.key === STORE_KEY) { state = sanitize(load(STORE_KEY, null)); render(); }
  });

  /* ---------- 起動 ---------- */
  showView(pref.view);
  setInterval(() => { if (pref.view === 'timetable' && pref.ttMode === 'mine' && !sheet.open) renderMine(); }, 60000);
  checkReminders();
  setInterval(checkReminders, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkReminders(); });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
