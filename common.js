/* 로미 PT 공통 기능: 구글 웹앱 통신 · 카톡에서 브라우저로 열기 · 푸시 알림 (고칠 필요 없어요) */
(function () {
  // 구글 웹앱 주소 (/exec 로 끝나는 주소)
  var APP_URL = 'https://script.google.com/macros/s/AKfycbyPg7jqfPL-R-CRsE4_AMDhDUcfDrDmjpjyAD_bVsJeiiYXr3EQwByy2azq8ZqtxKda/exec';

  var PT = window.PT = {};
  PT.APP_URL = APP_URL;

  /* ---------- 통신 ---------- */
  PT.errMsg = function (e) { return String((e && e.message) || e || '').replace(/^(Exception|Error|ScriptError|TypeError):\s*/, '').trim(); };
  PT.API = function (fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    return fetch(APP_URL, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn: fn, args: args }) })
      .catch(function () { throw new Error('인터넷 연결을 확인하고 다시 시도해 주세요.'); })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var j; try { j = JSON.parse(t); } catch (e) { throw new Error('서버 응답을 읽지 못했어요. 잠시 후 다시 시도해 주세요.'); }
        if (!j.ok) throw new Error(j.error || '오류가 났어요.');
        return j.data;
      });
  };

  /* ---------- 카톡 등 앱 안에서 열렸을 때: 사파리/크롬으로 넘기기 ---------- */
  var ua = navigator.userAgent || '';
  var isAndroid = /Android/i.test(ua), isIOS = /iPhone|iPad|iPod/i.test(ua);
  var inKakao = /KAKAOTALK/i.test(ua), inLine = /\bLine\//i.test(ua);
  var inOtherApp = /FBAN|FBAV|Instagram|NAVER\(inapp|DaumApps|everytimeApp|BAND\//i.test(ua);
  function chromeIntent() { return 'intent://' + location.href.replace(/^https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end'; }
  function goOut() {
    if (inKakao) location.href = isAndroid ? chromeIntent() : 'kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href);
    else if (inLine) location.href = location.href + (location.search ? '&' : '?') + 'openExternalBrowser=1';
    else if (isAndroid) location.href = chromeIntent();
  }
  PT.escaping = inKakao || (inLine && !/openExternalBrowser=1/.test(location.search)) || inOtherApp;

  var css = document.createElement('style');
  css.textContent = '#ptbar{position:fixed;left:10px;right:10px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:40;display:none;background:#1e1b2e;color:#fff;border-radius:16px;padding:12px 14px;box-shadow:0 8px 24px rgba(0,0,0,.25);font-size:14px;line-height:1.5;max-width:540px;margin:0 auto}'
    + '#ptbar .r{display:flex;gap:8px;margin-top:10px}#ptbar button{flex:1;border:0;border-radius:10px;padding:10px;font-size:14px;font-weight:700}'
    + '#ptbar .y{background:#a78bfa;color:#1a1030}#ptbar .n{background:#3a3550;color:#ddd}'
    + '#ptout{position:fixed;inset:0;z-index:50;background:#f7f5fc;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;color:#1e1b2e;font-size:15px;line-height:1.55}'
    + '#ptout img{width:88px;height:88px;border-radius:20px}#ptout button{border:0;border-radius:12px;padding:13px 20px;font-size:15px;font-weight:700;width:100%;max-width:320px}'
    + '#ptout .a{background:#7c3aed;color:#fff}#ptout .b{background:#fff;color:#4c1d95;border:1px solid #d6cfe6}';
  document.head.appendChild(css);

  function showEscape() {
    var browser = isAndroid ? '크롬' : '사파리', manual = inOtherApp && !isAndroid;
    var d = document.createElement('div'); d.id = 'ptout';
    d.innerHTML = '<img src="icon-192.png" alt="">'
      + '<div>' + (manual ? '<b>사파리에서 열어 주세요</b><br>화면의 <b>⋯ 메뉴 → \'Safari로 열기\'</b>를 눌러 주세요.' : '<b>' + browser + '로 여는 중이에요…</b><br>안 넘어가면 아래 버튼을 눌러 주세요.') + '</div>'
      + (manual ? '' : '<button class="a" id="ptgo">' + browser + '로 열기</button>')
      + '<button class="b" id="ptcp">링크 복사하기</button><div id="pthint" style="font-size:12.5px;color:#6e6880"></div>';
    document.body.appendChild(d);
    var go = document.getElementById('ptgo'); if (go) go.onclick = goOut;
    document.getElementById('ptcp').onclick = function () {
      var u = location.href.replace(/[?&]openExternalBrowser=1/, '');
      (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () {
        document.getElementById('pthint').textContent = '복사했어요! ' + browser + '를 열고 주소창에 붙여넣어 주세요.';
      }).catch(function () { document.getElementById('pthint').textContent = u; });
    };
    if (!manual) setTimeout(goOut, 300);
  }

  /* ---------- 푸시 알림 ---------- */
  var cfg = self.FIREBASE_CONFIG || {}, vapid = self.FIREBASE_VAPID_KEY || '';
  var cfgOK = !!(cfg.apiKey && cfg.projectId && vapid && window.firebase);
  var supported = ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var logged = false, saver = null, token = null, messaging = null, regP = null, listeners = [], bar = null;

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function state() { if (!cfgOK) return null; if (!supported) return 'unsupported'; return Notification.permission; }
  function emit() { var s = state(); listeners.forEach(function (f) { try { f(s); } catch (e) {} }); }
  function sw() { if (!regP) regP = navigator.serviceWorker.register('firebase-messaging-sw.js'); return regP; }
  function initM() {
    if (messaging || !cfgOK || !supported) return;
    firebase.initializeApp(cfg);
    messaging = firebase.messaging();
    messaging.onMessage(function (p) {
      var n = (p && p.notification) || {};
      sw().then(function (r) { r.showNotification(n.title || '로미 PT', { body: n.body || '', icon: 'icon-192.png' }); });
    });
  }
  function save() {
    if (!logged || !saver || !token) return;
    var key = saver.key + '|' + token;
    if (store('pt_push_saved') === key) return;
    saver.fn(token).then(function () { store('pt_push_saved', key); }).catch(function () {});
  }
  function fetchToken() {
    if (state() !== 'granted') return;
    initM();
    sw().then(function (r) { return messaging.getToken({ vapidKey: vapid, serviceWorkerRegistration: r }); })
      .then(function (t) { if (t) { token = t; save(); } })
      .catch(function (e) { console.warn('push token', e); });
  }
  function hideBar() { if (bar) bar.style.display = 'none'; }
  function showBar(html) {
    if (!bar) { bar = document.createElement('div'); bar.id = 'ptbar'; document.body.appendChild(bar); bar.addEventListener('click', onBar); }
    bar.innerHTML = html; bar.style.display = 'block';
  }
  var CLOSE = '<button class="n" data-k="close">닫기</button>';
  function snoozed() { return Date.now() - Number(store('pt_snooze') || 0) < 3 * 864e5; }
  function autoAsk() {
    var s = state();
    if (!logged || !s) return;
    if (s === 'unsupported') { if (isIOS && !standalone && !snoozed()) showBar('📲 아이폰은 <b>홈 화면에 추가한 \'로미 PT\' 아이콘</b>으로 열어야 알림을 받을 수 있어요.<div class="r"><button class="n" data-k="snooze">닫기</button></div>'); return; }
    if (s === 'default' && !snoozed()) showBar('🔔 <b>알림을 켜 주세요</b><br>변경 요청, 대기 자리 소식을 바로 알려 드려요.<div class="r"><button class="n" data-k="snooze">나중에</button><button class="y" data-k="on">알림 켜기</button></div>');
  }
  function openPanel() {
    var s = state();
    if (!s) return showBar('알림 기능이 아직 준비 중이에요.<div class="r">' + CLOSE + '</div>');
    if (s === 'unsupported') {
      if (isIOS && !standalone) return showBar('📲 아이폰은 <b>홈 화면에 추가한 \'로미 PT\' 아이콘</b>으로 열어야 알림을 켤 수 있어요.<br>사파리 공유 버튼 → \'홈 화면에 추가\' 후 그 아이콘으로 열어 주세요. (iOS 16.4 이상)<div class="r">' + CLOSE + '</div>');
      return showBar('이 브라우저는 알림을 지원하지 않아요. <b>크롬</b>으로 열어 주세요.<div class="r">' + CLOSE + '</div>');
    }
    if (s === 'default') return showBar('🔔 <b>알림 켜기</b><br>변경 요청, 대기 자리 소식을 바로 알려 드려요.<div class="r">' + CLOSE + '<button class="y" data-k="on">알림 켜기</button></div>');
    if (s === 'denied') {
      var how = isIOS ? '아이폰 <b>설정 → 알림 → 로미 PT → 알림 허용</b>을 켜 주세요.'
        : '홈 화면의 <b>로미 PT 아이콘을 길게 누르기 → ⓘ 앱 정보 → 알림 → 허용</b>을 켜 주세요.';
      return showBar('🔕 <b>알림이 꺼져 있어요</b><br>' + how + '<div class="r">' + CLOSE + '<button class="y" data-k="recheck">다시 확인</button></div>');
    }
    fetchToken();
    showBar('🔔 <b>알림이 켜져 있어요</b><br>변경 요청, 대기 자리 소식이 오면 알려 드려요.<div class="r">' + CLOSE + '</div>');
  }
  function onBar(e) {
    var b = e.target.closest('button'); if (!b) return;
    var k = b.dataset.k;
    if (k === 'on') {
      sw();
      Notification.requestPermission().then(function (p) {
        if (p === 'granted') { fetchToken(); showBar('🔔 <b>알림이 켜졌어요!</b><div class="r">' + CLOSE + '</div>'); }
        else hideBar();
        emit();
      });
    } else if (k === 'snooze') { store('pt_snooze', String(Date.now())); hideBar(); }
    else if (k === 'recheck') { emit(); openPanel(); }
    else hideBar();
  }
  var lastPerm = supported ? Notification.permission : null;
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !supported) return;
    if (Notification.permission !== lastPerm) { lastPerm = Notification.permission; emit(); if (lastPerm === 'granted') fetchToken(); }
  });

  PT.Push = {
    state: state,
    openPanel: openPanel,
    onChange: function (f) { listeners.push(f); },
    // 로그인하면 setLoggedIn(true, 저장함수, 사용자키), 로그아웃하면 setLoggedIn(false)
    setLoggedIn: function (on, fn, key) {
      logged = !!on; saver = on ? { fn: fn, key: key || '' } : null;
      if (on) { fetchToken(); autoAsk(); } else hideBar();
      emit();
    }
  };

  function boot() {
    if (PT.escaping) showEscape();
    if ('serviceWorker' in navigator) sw().catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
