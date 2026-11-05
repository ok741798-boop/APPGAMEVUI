'use strict';
/* =========================================================
   NÉ ĐI! – One Tap Survival
   Cơ chế: Vật thể sống (#4) + Kẻ săn đuổi (#3) + Khoe khoang (#7)
   ========================================================= */

// ---------- Hằng số ----------
// Khung chơi tự co giãn theo màn hình: cao tối thiểu 760, rộng 380..900 đơn vị logic
const BASE_W = 420, BASE_H = 760, MIN_W = 380, MAX_W = 900;
let W = BASE_W, H = BASE_H;      // kích thước khung chơi hiện tại (đơn vị logic)
let offX = 0;                    // lề trái khi màn hình rộng hơn MAX_W
const G = 2000;                  // trọng lực
const JUMP = 760, AIR = 640;     // lực nhảy / nhảy đôi
const HALF = 11;                 // nửa cạnh nhân vật
const RUN = 165;                 // tốc độ chạy ngang tự động
const MOVE = 230;                // tốc độ đi trái/phải bằng nút
const input = { left: false, right: false, down: false };
// Gộp bàn phím + nút cảm ứng + tay cầm (gamepad)
const inputDir = () => (input.right || input.gpRight ? 1 : 0) - (input.left || input.gpLeft ? 1 : 0);
const downHeld = () => input.down || input.gpDown;
const DASH_SPEED = 720, DASH_TIME = .16, DASH_INV = .3, DASH_CD = .8;   // lướt né
const GROUND = BASE_H - 60;

const $ = id => document.getElementById(id);
// desynchronized: giảm độ trễ hiển thị trên trình duyệt hỗ trợ
const cv = $('c'), ctx = cv.getContext('2d', { alpha: false, desynchronized: true }), wrap = $('wrap');
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, target, step) => v < target ? Math.min(v + step, target) : Math.max(v - step, target);

// ---------- Loại vật thể ("Vật thể sống") ----------
const TYPES = {
  rock:   { name: 'Thường',    color: '#9aa3b5', desc: 'Rơi thẳng',                 from: 0 },
  blink:  { name: 'Nhấp nháy', color: '#b06cff', desc: 'Biến mất rồi hiện lại',     from: 8 },
  homing: { name: 'Đuổi theo', color: '#ff4d5e', desc: 'Bám theo bạn',              from: 16 },
  split:  { name: 'Tách đôi',  color: '#3ddc84', desc: 'Ngang tầm bạn thì tách 2',  from: 24 },
  bomb:   { name: 'Nổ',        color: '#ff9a2e', desc: 'Chạm bục → sóng xung kích', from: 32 },
};
const WEIGHT = { rock: 1, blink: .6, homing: .5, split: .5, bomb: .45 };
const DEATH_MSG = {
  lava: 'Bị dung nham nuốt chửng!',
  rock: 'Trúng đá rơi!',
  blink: 'Khối tím hiện ra đúng lúc...',
  homing: 'Bị khối đỏ đuổi kịp!',
  split: 'Trúng khối xanh!',
  shard: 'Trúng mảnh vỡ xanh!',
  bomb: 'Dính sóng nổ!',
};

// ---------- Lưu trữ ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('nedi_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('nedi_' + k, JSON.stringify(v)); } catch (e) {} },
};
let stats = Object.assign(
  { runs: 0, dodges: 0, nears: 0, bestScore: 0, bestH: 0, bestTime: 0, bestCombo: 0, dailyCount: 0, dailyDay: '' },
  store.get('stats', {})
);

// ---------- Danh hiệu ----------
const TITLES = [
  ['Tân binh',             'Chơi lượt đầu tiên',            s => s.runs >= 1],
  ['Kẻ né 100',            'Né tổng 100 vật thể',           s => s.dodges >= 100],
  ['Người né 1000',        'Né tổng 1000 vật thể',          s => s.dodges >= 1000],
  ['Sợi tóc',              'Suýt chết tổng 50 lần',         s => s.nears >= 50],
  ['Thần suýt chết',       'Suýt chết tổng 300 lần',        s => s.nears >= 300],
  ['Nhà leo núi',          'Leo cao 200m',                  s => s.bestH >= 200],
  ['Chạm mây',             'Leo cao 500m',                  s => s.bestH >= 500],
  ['Phi hành gia',         'Leo cao 1000m',                 s => s.bestH >= 1000],
  ['Bậc thầy combo',       'Đạt combo x8',                  s => s.bestCombo >= 8],
  ['Kẻ bất tử',            'Sống sót 120 giây',             s => s.bestTime >= 120],
  ['Chiến binh thử thách', 'Hoàn thành 3 thử thách ngày',   s => s.dailyCount >= 3],
];
const unlockedTitles = () => TITLES.filter(t => t[2](stats)).map(t => t[0]);

// ---------- Thử thách hàng ngày ----------
function dayKey() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const CHALLENGES = [
  { k: 'dodges',   txt: 'Né {g} vật thể trong 1 lượt',    g: [30, 40, 50] },
  { k: 'maxH',     txt: 'Leo cao {g}m',                    g: [150, 200, 250] },
  { k: 'nears',    txt: 'Suýt chết {g} lần trong 1 lượt',  g: [5, 8, 10] },
  { k: 'time',     txt: 'Sống sót {g} giây',               g: [45, 60, 75] },
  { k: 'maxCombo', txt: 'Đạt combo x{g}',                  g: [3, 4, 5] },
];
const daily = (() => {
  const h = hash(dayKey()), c = CHALLENGES[h % CHALLENGES.length], goal = c.g[(h >>> 8) % 3];
  return { k: c.k, goal, text: c.txt.replace('{g}', goal) };
})();
const dailyDone = () => store.get('dailyDone', '') === dayKey();

// ---------- Âm thanh (WebAudio, không cần file) ----------
let ac = null;
function initAudio() {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (ac && ac.state === 'suspended') ac.resume();
}
function sfx(f, d = .1, type = 'square', v = .05, slide = 0) {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain(), now = ac.currentTime;
  o.type = type; o.frequency.setValueAtTime(f, now);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), now + d);
  g.gain.setValueAtTime(v, now); g.gain.exponentialRampToValueAtTime(.0001, now + d);
  o.connect(g).connect(ac.destination); o.start(now); o.stop(now + d);
}

// ---------- Kích thước màn hình (điện thoại / laptop / PC) ----------
let scale = 1;
// Mức chất lượng tự động theo cấu hình máy: 0 cao, 1 vừa, 2 thấp (máy yếu)
let tier = 0;
let lowFx = false;   // = tier 2: tắt hiệu ứng phát sáng
const TIER_DPR = [2, 1.5, 1];          // độ phân giải render tối đa
const TIER_PART = [400, 180, 80];      // số hạt hiệu ứng tối đa cùng lúc
const TIER_BURST = [1, .6, .35];       // tỉ lệ hạt mỗi lần nổ / nhảy
const MAX_PIXELS = 3.7e6;              // ~2560x1440: màn 4K không vẽ thừa điểm ảnh gây nặng máy
const ZOOMS = [1, 1.25, 1.5];
let zoom = ZOOMS.includes(store.get('zoom', 1.25)) ? store.get('zoom', 1.25) : 1.25;   // mức phóng to màn hình game

// Khi bật lowFx, mọi lệnh shadowBlur bị bỏ qua (hiệu ứng glow tốn GPU nhất trên điện thoại yếu)
const SB = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'shadowBlur');
if (SB && SB.set) Object.defineProperty(ctx, 'shadowBlur', {
  get() { return SB.get.call(ctx); },
  set(v) { SB.set.call(ctx, lowFx ? 0 : v); },
});

function resize() {
  // visualViewport: kích thước thật trên điện thoại (trừ thanh địa chỉ / bàn phím ảo)
  const vv = window.visualViewport;
  const vw = vv ? vv.width : innerWidth, vh = vv ? vv.height : innerHeight;
  // Canvas phủ kín màn hình. Khung chơi cao >= 760, rộng 380..900 đơn vị logic:
  //  điện thoại dài → thấy nhiều trời hơn; iPad/laptop → khung rộng ra; màn quá rộng → 2 bên trang trí
  // Điện thoại xoay ngang (màn thấp): dùng khung thấp hơn để nhân vật không bị bé
  const shortLand = vw > vh && vh < 600;
  const fit = Math.min(vh / (shortLand ? 560 : BASE_H), vw / MIN_W);   // vừa khít, chưa phóng to
  // Phóng to theo mức người chơi chọn, nhưng giữ khung tối thiểu để HUD và lối chơi không bị chật
  const ui = Math.max(fit, Math.min(fit * zoom, vw / 360, vh / (shortLand ? 460 : 600)));   // số pixel CSS cho mỗi đơn vị logic
  const viewW = vw / ui;
  W = Math.round(Math.min(viewW, MAX_W)); H = Math.round(vh / ui);
  offX = (viewW - W) / 2;
  const dpr = Math.max(.75, Math.min(window.devicePixelRatio || 1, TIER_DPR[tier], Math.sqrt(MAX_PIXELS / (vw * vh))));
  cv.style.width = vw + 'px'; cv.style.height = vh + 'px';
  cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
  scale = ui * dpr;
  // Biến CSS cho giao diện: --q co theo màn hình (menu, chữ), --u/--offx để đặt nút theo khung chơi
  const r = document.documentElement.style;
  // Màn ngang: menu chia 2 cột nên được to hơn; màn dọc: giới hạn theo chiều cao để menu không bị tràn
  const landscape = vw >= vh;
  r.setProperty('--q', Math.min(vw / (landscape ? 840 : BASE_W), vh / (landscape ? 640 : 960)) * 4.2 + 'px');
  r.setProperty('--u', ui + 'px');
  r.setProperty('--offx', offX * ui + 'px');
}
function onResize() {
  resize();
  if (mode === 'menu') reset();   // menu: đặt lại cảnh nền cho khớp khung mới
  if (pl) pl.x = clamp(pl.x, HALF, W - HALF);
  // Đổi kích thước làm xoá canvas: vẽ lại khung hình cuối khi đang dừng / game over
  if ((mode === 'over' || mode === 'pause') && frames.length) render(frames[frames.length - 1].s);
}
addEventListener('resize', onResize);
if (window.visualViewport) visualViewport.addEventListener('resize', onResize);
addEventListener('orientationchange', () => setTimeout(onResize, 250));
resize();

// Nhận diện thiết bị cảm ứng để hiện nút bấm, còn máy tính thì hiện hướng dẫn phím
const setTouch = on => document.body.classList.toggle('touch', on);
setTouch(matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches));
addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch' || e.pointerType === 'pen') setTouch(true);
  else if (e.pointerType === 'mouse') setTouch(false);
}, true);

// ---------- Trạng thái game ----------
let mode = 'menu';           // menu | play | dying | over | replay
let pl, plats, objs, shocks, parts, texts, cam, lava, t, topY, spawnT, shake, slowT;
let combo, comboT, run, frames, ghostRec, ghostT, bestGhost, deathT, deathReason, lastResult, lastCx;
let waveT, climbT, climbH, climbRate;

function reset() {
  pl = { x: W / 2, y: GROUND - HALF, vx: 0, vy: 0, dir: 1, aim: 0, trail: [], gvx: 0, dashT: 0, dashDir: 1, dashCD: 0, inv: 0, onGround: true, coyote: 0, jumps: 0, sq: 1, alive: true, plat: null };
  lastCx = W / 2;
  waveT = rand(16, 20); climbT = 0; climbH = 0; climbRate = 0;
  plats = [{ x: 0, y: GROUND, w: W, vx: 0, ground: true }];
  objs = []; shocks = []; parts = []; texts = [];
  cam = GROUND + 60 - H; lava = cam + H + 120; t = 0; topY = GROUND; spawnT = 1.5; shake = 0; slowT = 0;
  combo = 0; comboT = 0;
  run = { dodges: 0, nears: 0, maxCombo: 0, bonus: 0, maxH: 0, time: 0 };
  frames = []; ghostRec = [[pl.x, pl.y]]; ghostT = 0;
  bestGhost = store.get('ghost', null);
  genPlats();
}
const curScore = () => Math.floor(run.maxH) + run.bonus;

function genPlats() {
  while (topY > cam - 240) {
    const hM = (GROUND - topY) / 10;
    topY -= rand(88, 122);
    const w = Math.max(58, rand(80, 135) - hM * .05);
    // Bục kế tiếp không quá xa bục trước để luôn nhảy tới được
    const cx = clamp(lastCx + rand(-190, 190), 8 + w / 2, W - 8 - w / 2);
    lastCx = cx;
    const p = { x: cx - w / 2, y: topY, w, vx: 0 };
    if (hM > 120 && Math.random() < .28) p.vx = (Math.random() < .5 ? -1 : 1) * rand(40, 85);
    plats.push(p);
  }
}

// ---------- Smart Spawning System ----------
const WARN_TIME = .5;   // vật thể xuất hiện phía trên màn hình trước 0.5s, có mũi tên báo trước

function pickType() {
  const pool = Object.keys(TYPES).filter(k => t >= TYPES[k].from);
  let r = Math.random() * pool.reduce((s, k) => s + WEIGHT[k], 0);
  for (const k of pool) { r -= WEIGHT[k]; if (r <= 0) return k; }
  return pool[0];
}

function makeObj(type, x, vy, yOff = 0) {
  // Giới hạn tốc độ rơi: luôn có ít nhất ~1.1s từ mép trên tới ngang tầm người chơi
  const reach = Math.max(200, pl.y - cam);
  vy = Math.min(vy, reach / 1.1);
  if (type === 'homing') vy *= .72;
  if (type === 'bomb') vy *= .85;
  const o = {
    type, x, y: cam - 30 - vy * WARN_TIME - yOff, r: type === 'rock' ? rand(12, 20) : 16, vx: 0, vy,
    t: 0, vis: true, passed: false, minD: 1e9, dead: false,
  };
  objs.push(o);
  return o;
}

// Kiểm tra vị trí công bằng: không xếp vật thể sát nhau thành bức tường không lối thoát
function fairX(x, r, spawnY) {
  for (const o of objs) {
    if (Math.abs(o.y - spawnY) < 150 && Math.abs(o.x - x) < r + o.r + 55) return false;
  }
  return true;
}

function spawnObj() {
  const type = pickType();
  const baseVy = rand(150, 200) + Math.min(150, t * 2);
  const spawnY = cam - 30 - baseVy * WARN_TIME;
  // Chỉ tối đa 1 vật thể "nhắm" vào người chơi cùng lúc
  const aimed = objs.some(o => o.aimed && !o.passed);
  let x = null;
  if (!aimed && Math.random() < .4) {
    // Dự đoán vị trí người chơi theo vận tốc (chỉ một phần, để vẫn né được)
    const lead = clamp((pl.y - spawnY) / baseVy, 0, 2.5);
    const vxNow = pl.onGround ? pl.gvx : pl.vx;
    x = clamp(pl.x + vxNow * lead * .5 + rand(-40, 40), 20, W - 20);
    if (!fairX(x, 18, spawnY)) x = null;
  }
  if (x === null) {
    for (let i = 0; i < 6 && x === null; i++) { const c = rand(20, W - 20); if (fairX(c, 18, spawnY)) x = c; }
  }
  if (x === null) return false;   // không có chỗ công bằng: bỏ lượt này
  const o = makeObj(type, x, baseVy);
  o.aimed = !aimed && Math.abs(x - pl.x) < 60;
  return true;
}

// Đợt tấn công theo nhịp: hàng rào có 1 khe hở, hoặc mưa chéo
function spawnWave() {
  const vy = 170 + Math.min(80, t);
  if (Math.random() < .5) {
    const gx = rand(70, W - 70);
    for (let x = 28; x < W - 10; x += 62) if (Math.abs(x - gx) > 62) makeObj('rock', x, vy).r = 15;
    floatText(W / 2, cam + 170, '⚠ HÀNG RÀO! Tìm khe hở', '#ff9a2e', 18);
  } else {
    const rev = Math.random() < .5;
    const n = Math.round(W / 70), stepX = (W - 70) / (n - 1);
    for (let i = 0; i < n; i++) makeObj('rock', rev ? W - 35 - i * stepX : 35 + i * stepX, vy, i * 55).r = 14;
    floatText(W / 2, cam + 170, '⚠ MƯA CHÉO!', '#ff9a2e', 18);
  }
  sfx(300, .25, 'triangle', .05, 200);
}

// Độ khó theo thời gian thực: leo nhanh → nhiều vật hơn; sát dung nham → bớt để có nhịp thở
function spawnInterval() {
  // Khung rộng hơn thì rơi dày hơn, giữ mật độ vật thể như nhau trên mọi thiết bị
  const base = Math.max(.32, 1.05 - t * .01) * (BASE_W / W);
  const climb = clamp(climbRate / 8, 0, 1);
  const danger = clamp(1 - (lava - pl.y) / 300, 0, 1);
  return base * (1 - climb * .25) * (1 + danger * .7) * rand(.75, 1.25);
}

// ---------- Hiệu ứng ----------
function burst(x, y, c, n, sp = 260) {
  n = Math.ceil(n * TIER_BURST[tier]);
  for (let i = 0; i < n && parts.length < TIER_PART[tier]; i++) {
    const a = Math.random() * Math.PI * 2, v = rand(.3, 1) * sp, life = rand(.4, .9);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life, max: life, s: rand(2, 5), c });
  }
}
function floatText(x, y, txt, c, size = 20) { texts.push({ x, y, txt, c, size, life: 1 }); }

// ---------- Điều khiển ----------
// Tìm bục gần nhất phía trên và tính vận tốc ngang để đáp đúng lên nó
function aimVx() {
  const foot = pl.y + HALF;
  let best = null, bs = 1e9;
  for (const p of plats) {
    const dy = foot - p.y;
    if (dy < 40 || dy > 140) continue;
    const dx = clamp(pl.x, p.x + 14, p.x + p.w - 14) - pl.x;
    const sc = dy + Math.abs(dx) * .6;
    if (sc < bs) {
      bs = sc;
      const air = (JUMP + Math.sqrt(Math.max(0, JUMP * JUMP - 2 * G * dy))) / G;
      best = dx / air;
    }
  }
  return best === null ? pl.dir * RUN : clamp(best, -320, 320);
}

const BUFFER = .15;   // bấm sớm một chút vẫn được tính (input buffer)
const buzz = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };

function jump() {
  if (!pl.alive) return;
  if (pl.onGround || pl.coyote > 0) {
    pl.vx = inputDir() ? inputDir() * MOVE : aimVx(); if (Math.abs(pl.vx) > 5) pl.dir = Math.sign(pl.vx);
    pl.vy = -JUMP; pl.jumps = 1; pl.onGround = false; pl.coyote = 0; pl.sq = 1.35; pl.jumpBuf = 0;
    sfx(420, .09, 'square', .045, 300); burst(pl.x, pl.y + HALF, '#cfeaff', 6, 120); buzz(8);
  } else if (pl.jumps < 2) {
    pl.vy = -AIR; pl.jumps = 2; pl.sq = 1.3; pl.jumpBuf = 0;
    if (inputDir()) pl.vx = inputDir() * MOVE;   // nhảy đôi đổi hướng ngay theo nút đang giữ
    sfx(640, .1, 'square', .045, 420); burst(pl.x, pl.y + HALF, '#5ef0ff', 12, 160); buzz(8);
  } else pl.jumpBuf = BUFFER;   // hết lượt nhảy: nhớ lệnh, chạm bục là nhảy luôn
}

// Lướt né: bấm ⚡ để lướt nhanh theo hướng đang giữ/đang nhìn, miễn nhiễm va chạm trong chốc lát
function dash(dir) {
  if (mode !== 'play' || !pl.alive) return;
  if (pl.dashCD > 0) { if (pl.dashCD < BUFFER) { pl.dashBuf = BUFFER; pl.dashBufDir = dir; } return; }
  buzz(12); pl.dashBuf = 0;
  pl.dashT = DASH_TIME; pl.dashDir = dir; pl.inv = DASH_INV; pl.dashCD = DASH_CD; pl.dir = dir;
  if (pl.onGround) pl.gvx = dir * MOVE;
  burst(pl.x - dir * 10, pl.y, '#bff9ff', 10, 140);
  sfx(900, .12, 'sawtooth', .035, -600);
}

// Lướt xuyên qua vật thể = né hoàn hảo
function perfectDodge(o) {
  if (o.perfect) return;
  o.perfect = true; o.passed = true;
  run.dodges++; run.nears++; combo++; comboT = 2.5; run.maxCombo = Math.max(run.maxCombo, combo);
  const b = 10 * combo; run.bonus += b; slowT = .15;
  floatText(pl.x, pl.y - 34, 'NÉ HOÀN HẢO! +' + b, '#9ff8ff', 18 + Math.min(combo, 8) * 2);
  sfx(1100, .16, 'triangle', .07, 300);
}

function boxDist(cx, cy) {
  const dx = Math.max(Math.abs(cx - pl.x) - HALF, 0), dy = Math.max(Math.abs(cy - pl.y) - HALF, 0);
  return Math.hypot(dx, dy);
}

function dodge(o) {
  run.dodges++; run.bonus += 1;
  if (o.minD < 14) {
    run.nears++; combo++; comboT = 2.5; run.maxCombo = Math.max(run.maxCombo, combo);
    const b = 5 * combo; run.bonus += b; slowT = .12;
    floatText(pl.x, pl.y - 32, 'SUÝT! +' + b, '#ffe066', 18 + Math.min(combo, 8) * 2);
    sfx(760 + combo * 70, .14, 'triangle', .07, 200);
  }
}

function explode(o) {
  o.dead = true;
  shocks.push({ x: o.x, y: o.y, r: 0, max: 82, age: 0 });
  burst(o.x, o.y, '#ff9a2e', 26, 300);
  if (o.y > cam && o.y < cam + H) { shake = Math.max(shake, 9); sfx(140, .35, 'sawtooth', .08, -90); }
}

function die(reason) {
  if (!pl.alive) return;
  pl.alive = false; deathReason = reason; deathT = 0; mode = 'dying';
  burst(pl.x, pl.y, '#5ef0ff', 44, 340); shake = 16;
  sfx(260, .55, 'sawtooth', .09, -200);
  if (navigator.vibrate) navigator.vibrate(120);
}

// ---------- Cập nhật ----------
function update(dt) {
  t += dt;

  for (const p of plats) if (p.vx) {
    p.x += p.vx * dt;
    if (p.x < 4) { p.x = 4; p.vx *= -1; }
    if (p.x + p.w > W - 4) { p.x = W - 4 - p.w; p.vx *= -1; }
  }

  // Nhân vật
  if (pl.alive) {
    run.time = t;
    pl.vy = Math.min(pl.vy + G * dt, 1100);
    pl.dashCD = Math.max(0, pl.dashCD - dt); pl.inv = Math.max(0, pl.inv - dt);
    pl.jumpBuf = Math.max(0, (pl.jumpBuf || 0) - dt);
    pl.dropBuf = Math.max(0, (pl.dropBuf || 0) - dt);
    if (pl.dashBuf > 0) { pl.dashBuf -= dt; if (pl.dashCD <= 0) dash(inputDir() || pl.dashBufDir); }
    if (pl.dashT > 0) {
      pl.dashT -= dt;
      pl.x = clamp(pl.x + pl.dashDir * DASH_SPEED * dt, HALF, W - HALF);
      if (!pl.onGround) { pl.vy = Math.min(pl.vy, 40); pl.vx = pl.dashDir * MOVE; }
      if (Math.random() < .35) parts.push({ x: pl.x - pl.dashDir * 12, y: pl.y + rand(-8, 8), vx: -pl.dashDir * 60, vy: 0, life: .25, max: .25, s: 3, c: '#bff9ff' });
    }
    // Đứng trên bục thì đứng yên, trừ khi giữ nút trái/phải
    const dirIn = inputDir();
    if (pl.onGround) {
      // Tăng/giảm tốc mượt thay vì bật tắt đột ngột
      if (pl.dashT <= 0) pl.gvx = approach(pl.gvx, dirIn * MOVE, (dirIn ? 1500 : 2400) * dt);
      if (pl.gvx) {
        pl.x += pl.gvx * dt;
        if (pl.x < HALF || pl.x > W - HALF) { pl.x = clamp(pl.x, HALF, W - HALF); pl.gvx = 0; }
      }
      if (dirIn) pl.dir = dirIn;
      // Nút xuống: rơi xuyên qua bục (trừ mặt đất)
      if ((downHeld() || pl.dropBuf > 0) && !pl.plat.ground) {
        pl.dropPlat = pl.plat; pl.dropT = .25; pl.onGround = false; pl.vy = 160; pl.dropBuf = 0; pl.coyote = 0;
      }
    } else {
      if (dirIn) pl.vx = approach(pl.vx, dirIn * MOVE, 900 * dt);
      if (downHeld()) pl.vy = Math.max(pl.vy, 750);   // lao xuống nhanh
      pl.x += pl.vx * dt;
      if (pl.x < HALF) { pl.x = HALF; pl.vx = Math.abs(pl.vx); }
      else if (pl.x > W - HALF) { pl.x = W - HALF; pl.vx = -Math.abs(pl.vx); }
      if (Math.abs(pl.vx) > 5) pl.dir = Math.sign(pl.vx);
    }
    pl.dropT = Math.max(0, (pl.dropT || 0) - dt);
    const prevBottom = pl.y + HALF, fallV = pl.vy, was = pl.onGround;
    pl.y += pl.vy * dt;
    pl.onGround = false;
    if (pl.vy >= 0) for (const p of plats) {
      if (pl.dropT > 0 && p === pl.dropPlat) continue;
      // Nới 4px ở mép bục để đáp sát mép vẫn đứng được
      if (pl.x + HALF + 4 > p.x && pl.x - HALF - 4 < p.x + p.w && prevBottom <= p.y + 1 && pl.y + HALF >= p.y) {
        pl.y = p.y - HALF; pl.vy = 0; pl.onGround = true; pl.jumps = 0; pl.plat = p;
        if (!was) {
          // Đáp xuống: giữ đà nếu đang giữ nút cùng hướng, không thì đứng lại
          pl.gvx = dirIn && Math.sign(pl.vx) === dirIn ? clamp(pl.vx, -MOVE, MOVE) : 0;
          if (fallV > 400) { pl.sq = .7; burst(pl.x, p.y, '#8f88d6', 5, 90); }
        }
        break;
      }
    }
    if (pl.onGround) {
      pl.vx = pl.gvx;   // đi quá mép bục thì rơi với đúng đà đang đi
      if (pl.plat.vx) pl.x = clamp(pl.x + pl.plat.vx * dt, HALF, W - HALF);
      pl.aim = aimVx();
      if (!dirIn && !pl.gvx && Math.abs(pl.aim) > 5) pl.dir = Math.sign(pl.aim);
    }
    pl.coyote = pl.onGround ? .1 : Math.max(0, pl.coyote - dt);
    if (pl.onGround && pl.jumpBuf > 0) jump();
    pl.trail.push([pl.x, pl.y]); if (pl.trail.length > 12) pl.trail.shift();
    run.maxH = Math.max(run.maxH, (GROUND - HALF - pl.y) / 10);

    const target = pl.y - H * .55;
    if (target < cam) cam += (target - cam) * Math.min(1, dt * 5);

    ghostT += dt;
    while (ghostT >= .1) { ghostT -= .1; ghostRec.push([Math.round(pl.x), Math.round(pl.y)]); }
  }
  pl.sq += (1 - pl.sq) * Math.min(1, dt * 12);

  // Kẻ săn đuổi: dung nham dâng lên, luôn bám sát đáy màn hình
  const lavaSpeed = t < 2 ? 0 : 32 + Math.min(75, (t - 2) * .9);
  lava -= lavaSpeed * dt;
  if (lava > cam + H + 70) lava = cam + H + 70;
  if (pl.alive && pl.y + HALF > lava + 6) die('lava');

  genPlats();
  plats = plats.filter(p => p.y < lava + 60);

  // Sinh vật thể
  if (pl.alive) {
    // Đo tốc độ leo (m/s) mỗi giây
    climbT += dt;
    if (climbT >= 1) { climbRate = climbRate * .5 + (run.maxH - climbH) * .5; climbH = run.maxH; climbT = 0; }
    waveT -= dt;
    if (t > 15 && waveT <= 0) { spawnWave(); waveT = rand(10, 14); spawnT = 1.4; }
    spawnT -= dt;
    if (spawnT <= 0) spawnT = spawnObj() ? spawnInterval() : .15;
  }

  // Vật thể sống
  const born = [];
  for (const o of objs) {
    o.t += dt;
    if (o.type === 'homing' && pl.alive) o.vx = clamp(o.vx + Math.sign(pl.x - o.x) * 280 * dt, -140, 140);
    if (o.type === 'blink') o.vis = (o.t % 1.3) < .8;
    if (o.type === 'split' && pl.alive && o.y > pl.y - 60 && Math.abs(o.x - pl.x) < 170) {
      o.dead = true;
      for (const s of [-1, 1]) born.push({
        type: 'shard', x: o.x, y: o.y, r: o.r * .62, vx: s * 150, vy: o.vy * .9,
        t: 0, vis: true, passed: false, minD: 1e9, dead: false,
      });
      burst(o.x, o.y, '#3ddc84', 10, 150); sfx(500, .08, 'triangle', .04, -200);
      continue;
    }
    const py = o.y;
    o.x += o.vx * dt; o.y += o.vy * dt;
    if (o.type === 'shard' && (o.x < o.r || o.x > W - o.r)) { o.vx *= -1; o.x = clamp(o.x, o.r, W - o.r); }
    if (o.type === 'bomb' && o.y > cam) {
      for (const p of plats) {
        if (o.x > p.x - 4 && o.x < p.x + p.w + 4 && py + o.r <= p.y && o.y + o.r >= p.y) { o.y = p.y - o.r; explode(o); break; }
      }
      if (!o.dead && o.y + o.r > lava) explode(o);
      if (o.dead) continue;
    }
    if (pl.alive) {
      if (o.vis) {
        const d = boxDist(o.x, o.y);
        if (d < o.r - 2) { if (pl.inv > 0) perfectDodge(o); else die(o.type); }
        o.minD = Math.min(o.minD, d - o.r);
      }
      if (!o.passed && o.y - o.r > pl.y + HALF) {
        o.passed = true;
        if (Math.abs(o.x - pl.x) < 150) dodge(o);
      }
    }
    if (o.y - o.r > lava + 20 || o.y > cam + H + 120) o.dead = true;
  }
  objs = objs.filter(o => !o.dead).concat(born);

  // Sóng xung kích
  for (const s of shocks) {
    s.age += dt;
    s.r = s.max * (1 - Math.pow(1 - Math.min(1, s.age / .3), 3));
    if (pl.alive && pl.inv <= 0 && s.age < .32 && Math.hypot(pl.x - s.x, pl.y - s.y) < s.r + HALF * .6) die('bomb');
  }
  shocks = shocks.filter(s => s.age < .6);

  if (comboT > 0) { comboT -= dt; if (comboT <= 0) combo = 0; }

  for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.life -= dt; }
  parts = parts.filter(p => p.life > 0);
  if (parts.length > TIER_PART[tier]) parts.splice(0, parts.length - TIER_PART[tier]);   // giới hạn theo cấu hình máy
  for (const x of texts) { x.y -= 40 * dt; x.life -= dt; }
  texts = texts.filter(x => x.life > 0);
  shake = Math.max(0, shake - dt * 30);
}

// ---------- Snapshot (dùng cho cả render lẫn replay) ----------
function ghostPos() {
  if (!bestGhost || !bestGhost.length) return null;
  const f = t / .1, i = Math.floor(f);
  if (i + 1 >= bestGhost.length) return null;
  const a = bestGhost[i], b = bestGhost[i + 1], k = f - i;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}
function snap() {
  return {
    cam, lava, shake, t,
    p: pl.alive ? [pl.x, pl.y, pl.dir, pl.sq, pl.onGround ? 1 : 0, pl.inv > 0 ? 1 : 0, pl.dashCD / DASH_CD] : null,
    aim: pl.alive && pl.onGround ? [pl.x, pl.y, pl.aim] : null,
    trail: pl.alive && (!pl.onGround || pl.dashT > 0) ? pl.trail.slice() : [],
    g: ghostPos(),
    plats: plats.filter(p => p.y > cam - 30 && p.y < cam + H + 30).map(p => [p.x, p.y, p.w, p.vx ? 1 : 0, p.ground ? 1 : 0]),
    objs: objs.map(o => [o.type, o.x, o.y, o.r, o.vis ? 1 : 0, o.t, o.vx, o.vy]),
    shocks: shocks.map(s => [s.x, s.y, s.r, 1 - s.age / .6]),
    parts: parts.map(p => [p.x, p.y, p.s, p.c, p.life / p.max]),
    texts: texts.map(x => [x.x, x.y, x.txt, x.c, Math.min(1, x.life * 2), x.size]),
    hud: { ...run, score: curScore(), combo },
  };
}

// ---------- Vẽ ----------
const STARS = Array.from({ length: 140 }, () => [Math.random(), Math.random(), rand(.2, 1)]);   // toạ độ 0..1, nhân với W/H khi vẽ
const mix = (a, b, k) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;

function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

let rT = 0;   // thời gian của khung hình đang vẽ (cho hoạt ảnh)

function drawBody(x, y, dir, sq, alpha, col, air) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y + HALF); ctx.scale(1 / sq, sq);
  const top = -HALF * 2;
  if (alpha < 1) {   // bóng ma / vệt mờ: chỉ vẽ dáng
    ctx.fillStyle = col; rr(-HALF, top, HALF * 2, HALF * 2, 8); ctx.fill(); ctx.restore(); return;
  }
  const back = -dir, wave = Math.sin(rT * 14);
  // Khăn quàng bay phía sau
  const sg = ctx.createLinearGradient(back * 4, 0, back * 26, 0);
  sg.addColorStop(0, '#ff4d7a'); sg.addColorStop(1, '#ffb347');
  ctx.fillStyle = sg; ctx.beginPath();
  ctx.moveTo(back * 6, top + 12);
  ctx.quadraticCurveTo(back * 16, top + 8 + wave * 3, back * 27, top + 10 + wave * 6);
  ctx.lineTo(back * 24, top + 17 + wave * 5);
  ctx.quadraticCurveTo(back * 15, top + 17 + wave * 2, back * 6, top + 17);
  ctx.fill();
  // Chân
  const step = air ? 0 : Math.sin(rT * 6) * .6;
  ctx.fillStyle = '#0f4f66';
  rr(-8, -4 + step, 6, 5, 2.5); ctx.fill(); rr(2, -4 - step, 6, 5, 2.5); ctx.fill();
  // Thân
  const g = ctx.createLinearGradient(0, top, 0, -2);
  g.addColorStop(0, '#d9feff'); g.addColorStop(.45, col); g.addColorStop(1, '#147fa3');
  ctx.fillStyle = g; ctx.shadowColor = col; ctx.shadowBlur = 18;
  rr(-HALF, top, HALF * 2, HALF * 2 - 2, 9); ctx.fill(); ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.4; ctx.stroke();
  // Chỏm tóc
  ctx.strokeStyle = '#d9feff'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(dir * 1, top + 1); ctx.quadraticCurveTo(back * 2, top - 7, back * 7, top - 6 + wave); ctx.stroke();
  // Vệt bóng
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.beginPath(); ctx.ellipse(-dir * 5, top + 4, 4, 1.8, -.4 * dir, 0, 7); ctx.fill();
  // Khăn quấn cổ
  ctx.fillStyle = '#ff4d7a'; rr(-HALF, top + 13, HALF * 2, 4, 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(-HALF + 2, top + 13.5, HALF * 2 - 4, 1);
  // Mắt (có chớp mắt)
  const blink = (rT % 3.4) < .12, ex = dir * 2.5, ey = top + 7.5 + (air ? -1 : 0);
  for (const sx of [-4.5, 4.5]) {
    if (blink) { ctx.strokeStyle = '#0b0a1f'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx + ex - 3, ey); ctx.lineTo(sx + ex + 3, ey); ctx.stroke(); continue; }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(sx + ex, ey, 3.4, 4.2, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#0b0a1f'; ctx.beginPath(); ctx.arc(sx + ex + dir, ey + .6, 2.1, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx + ex + dir - .8, ey - .6, .8, 0, 7); ctx.fill();
  }
  // Miệng: cười khi đứng, há "o" khi bay
  ctx.fillStyle = ctx.strokeStyle = '#0b0a1f'; ctx.lineWidth = 1.3;
  ctx.beginPath();
  if (air) { ctx.ellipse(ex, top + 12.5, 1.6, 1.4, 0, 0, 7); ctx.fill(); }
  else { ctx.arc(ex, top + 11, 2.2, .2, Math.PI - .2); ctx.stroke(); }
  // Má hồng
  ctx.fillStyle = 'rgba(255,120,170,.6)';
  ctx.beginPath(); ctx.arc(-7.5 + ex, top + 11.5, 1.8, 0, 7); ctx.arc(7.5 + ex, top + 11.5, 1.8, 0, 7); ctx.fill();
  ctx.restore();
}

function hills(base, amp, freq, off, col) {
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 12) ctx.lineTo(x, base - Math.abs(Math.sin(x * freq + off)) * amp - Math.sin(x * freq * 2.3 + off) * amp * .3);
  ctx.lineTo(W, H); ctx.fill();
}

function pill(x, y, w, h, glow) {
  ctx.save();
  ctx.fillStyle = 'rgba(12,8,30,.55)'; ctx.strokeStyle = glow || 'rgba(255,255,255,.18)'; ctx.lineWidth = 1.5;
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 12; }
  rr(x, y, w, h, h / 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}

// Vệt đuôi phía sau vật thể, ngược hướng di chuyển
function tail(r, vx, vy, c, len = 3.2) {
  const L = r * len;
  ctx.save(); ctx.rotate(Math.atan2(-vy, -vx));
  const g = ctx.createLinearGradient(0, 0, L, 0);
  g.addColorStop(0, c); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.beginPath();
  ctx.moveTo(0, -r * .9); ctx.quadraticCurveTo(L * .55, -r * .55, L, 0); ctx.quadraticCurveTo(L * .55, r * .55, 0, r * .9);
  ctx.fill(); ctx.restore();
}
function radial(r, c0, c1, c2) {
  const g = ctx.createRadialGradient(-r * .35, -r * .35, r * .1, 0, 0, r * 1.05);
  g.addColorStop(0, c0); g.addColorStop(.55, c1); g.addColorStop(1, c2);
  return g;
}

function drawObj(o, s) {
  const [type, x, y, r, vis, ot, vx = 0, vy = 200] = o;
  ctx.save(); ctx.translate(x, y);

  if (type === 'rock') {            // Thiên thạch rực lửa
    tail(r, vx, vy, 'rgba(255,140,50,.75)', 3.6);
    tail(r * .6, vx, vy, 'rgba(255,240,170,.8)', 3);
    ctx.rotate(ot * 1.6);
    ctx.fillStyle = radial(r, '#e3e7ef', '#7d8597', '#353a48');
    ctx.shadowColor = '#ff9a4a'; ctx.shadowBlur = 14;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2, rr2 = r * (.84 + .16 * Math.sin(i * 2.7 + r));
      i ? ctx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2) : ctx.moveTo(rr2, 0);
    }
    ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(30,30,45,.45)';
    ctx.beginPath(); ctx.arc(-r * .3, -r * .15, r * .24, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(r * .35, r * .3, r * .17, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(r * .15, -r * .45, r * .1, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,150,60,.8)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-r * .6, r * .3); ctx.lineTo(-r * .2, r * .5); ctx.lineTo(0, r * .2); ctx.stroke();

  } else if (type === 'blink') {    // Pha lê ma thuật
    const k = r * 1.25;
    const diamond = () => { ctx.beginPath(); ctx.moveTo(0, -k); ctx.lineTo(k * .7, 0); ctx.lineTo(0, k); ctx.lineTo(-k * .7, 0); ctx.closePath(); };
    ctx.rotate(Math.sin(ot * 2) * .25);
    if (!vis) {
      ctx.globalAlpha = .4; ctx.strokeStyle = '#c99bff'; ctx.setLineDash([3, 4]); ctx.lineWidth = 2;
      diamond(); ctx.stroke(); ctx.restore(); return;
    }
    if (ot % 1.3 > 1.1) {   // vừa hiện lại: chớp sáng
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.globalAlpha = .8;
      ctx.beginPath(); ctx.arc(0, 0, k + 6, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    }
    const g = ctx.createLinearGradient(-k, -k, k, k);
    g.addColorStop(0, '#f3e6ff'); g.addColorStop(.45, '#b06cff'); g.addColorStop(1, '#4b1d8f');
    ctx.fillStyle = g; ctx.shadowColor = '#b06cff'; ctx.shadowBlur = 20; diamond(); ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -k); ctx.lineTo(0, k); ctx.moveTo(-k * .7, 0); ctx.lineTo(k * .7, 0); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.moveTo(0, -k); ctx.lineTo(-k * .35, -k * .2); ctx.lineTo(0, -k * .1); ctx.fill();
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 3; i++) {   // lấp lánh xoay quanh
      const a = ot * 3 + i * 2.1, d = k + 5, sz = 1.5 + Math.sin(ot * 8 + i) * .8;
      ctx.fillRect(Math.cos(a) * d - sz / 2, Math.sin(a) * d - sz / 2, sz, sz);
    }

  } else if (type === 'homing') {   // Quái mắt đỏ săn đuổi
    tail(r * .8, vx, vy, 'rgba(255,60,80,.45)', 2.5);
    ctx.save(); ctx.rotate(ot * 3);
    ctx.fillStyle = '#8e1027';
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(r - 3, -4.5); ctx.lineTo(r + 7, 0); ctx.lineTo(r - 3, 4.5); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = radial(r, '#ff9aa4', '#e0233f', '#6e0b1c');
    ctx.shadowColor = '#ff4d5e'; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    let lx = 0, ly = 1;
    if (s.p) { const dx = s.p[0] - x, dy = s.p[1] - y, d = Math.hypot(dx, dy) || 1; lx = dx / d; ly = dy / d; }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * .52, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffb02e'; ctx.beginPath(); ctx.arc(lx * r * .2, ly * r * .2, r * .3, 0, 7); ctx.fill();
    ctx.fillStyle = '#1a0006'; ctx.beginPath(); ctx.ellipse(lx * r * .24, ly * r * .24, r * .09, r * .24, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(lx * r * .2 - 2, ly * r * .2 - 2, 1.4, 0, 7); ctx.fill();
    ctx.strokeStyle = '#4a0010'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-r * .6, -r * .62); ctx.lineTo(r * .6, -r * .45); ctx.stroke();

  } else if (type === 'bomb') {     // Bom hẹn giờ
    const warn = ot % .4 < .2;
    ctx.globalAlpha = .35 + (warn ? .3 : 0);
    ctx.strokeStyle = '#ff9a2e'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r + 5 + Math.sin(ot * 12) * 2, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = radial(r, '#8a8aa3', '#2b2b3a', '#0d0d14');
    ctx.shadowColor = '#ff9a2e'; ctx.shadowBlur = warn ? 22 : 10;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    if (warn) { ctx.fillStyle = 'rgba(255,60,30,.35)'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(-r * .4, -r * .4, r * .25, r * .14, -.7, 0, 7); ctx.fill();
    ctx.fillStyle = '#ff9a2e'; ctx.font = `900 ${r}px system-ui`; ctx.textAlign = 'center'; ctx.fillText('!', 0, r * .36);
    ctx.fillStyle = '#4a4a5c'; ctx.fillRect(-4, -r - 4, 8, 5);
    ctx.strokeStyle = '#c8a26a'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -r - 4); ctx.quadraticCurveTo(7, -r - 10, 3, -r - 15); ctx.stroke();
    const sp = 3 + Math.random() * 2;
    ctx.fillStyle = '#fff6a0'; ctx.shadowColor = '#ff7a1f'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(3, -r - 16, sp, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffcf3f'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * 7; ctx.beginPath(); ctx.moveTo(3, -r - 16); ctx.lineTo(3 + Math.cos(a) * 7, -r - 16 + Math.sin(a) * 7); ctx.stroke();
    }

  } else if (type === 'split') {    // Slime xanh sắp tách
    const wob = Math.sin(ot * 10) * .08;
    ctx.scale(1 + wob, 1 - wob);
    ctx.fillStyle = radial(r, '#c8ffe0', '#3ddc84', '#0f6b3c');
    ctx.shadowColor = '#3ddc84'; ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(-r, r * .3);
    ctx.bezierCurveTo(-r * 1.05, -r * 1.1, r * 1.05, -r * 1.1, r, r * .3);
    ctx.quadraticCurveTo(r * .9, r * .95, 0, r * .9);
    ctx.quadraticCurveTo(-r * .9, r * .95, -r, r * .3);
    ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(-r * .4, -r * .45, r * .22, r * .12, -.6, 0, 7); ctx.fill();
    ctx.strokeStyle = '#0b4a28'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(0, -r * .75); ctx.lineTo(-3, -r * .3); ctx.lineTo(3, 0); ctx.lineTo(-1, r * .5); ctx.stroke();
    ctx.fillStyle = '#0b2a18';
    ctx.beginPath(); ctx.arc(-r * .45, r * .05, 2.2, 0, 7); ctx.arc(r * .45, r * .05, 2.2, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-r * .45 - .7, r * .05 - .7, .8, 0, 7); ctx.arc(r * .45 - .7, r * .05 - .7, .8, 0, 7); ctx.fill();

  } else if (type === 'shard') {    // Giọt slime văng ra
    tail(r, vx, vy, 'rgba(61,220,132,.5)', 2.6);
    ctx.rotate(Math.atan2(vy, vx) - Math.PI / 2);
    ctx.fillStyle = radial(r, '#c8ffe0', '#3ddc84', '#0f6b3c');
    ctx.shadowColor = '#3ddc84'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(0, -r * 1.5);
    ctx.bezierCurveTo(r * 1.1, -r * .2, r, r, 0, r); ctx.bezierCurveTo(-r, r, -r * 1.1, -r * .2, 0, -r * 1.5);
    ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(-r * .3, 0, r * .2, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function render(s, opt = {}) {
  drawSides();
  ctx.setTransform(scale, 0, 0, scale, offX * scale, 0);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();   // chỉ vẽ trong khung chơi
  rT = s.t;
  const k = Math.min(1, s.hud.maxH / 600);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, mix([38, 26, 82], [4, 4, 18], k));
  bg.addColorStop(1, mix([150, 60, 90], [24, 14, 52], k));
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  for (const [sx, sy, d] of STARS) {
    const yy = ((sy * H - s.cam * d * .15) % H + H) % H;
    ctx.globalAlpha = (.25 + k * .6) * d; ctx.fillStyle = '#fff'; ctx.fillRect(sx * W, yy, d * 2, d * 2);
  }
  ctx.globalAlpha = 1;

  // Tinh vân + đồi núi phía xa (trôi chậm khi leo lên)
  for (const [nx, ny, nr, nc] of [[.21, 180, 220, '120,60,255'], [.8, 460, 260, '255,60,150']]) {
    const yy = ((ny - s.cam * .08) % (H + 400) + H + 400) % (H + 400) - 200;
    const ng = ctx.createRadialGradient(nx * W, yy, 0, nx * W, yy, nr);
    ng.addColorStop(0, `rgba(${nc},.16)`); ng.addColorStop(1, `rgba(${nc},0)`);
    ctx.fillStyle = ng; ctx.fillRect(0, 0, W, H);
  }
  const hb = H - 30 - s.cam * .2;
  if (hb - 200 < H) { hills(hb - 70, 130, .011, 1, 'rgba(70,36,110,.55)'); hills(hb, 80, .017, 4, 'rgba(28,14,52,.85)'); }

  const shx = s.shake ? rand(-s.shake, s.shake) : 0, shy = s.shake ? rand(-s.shake, s.shake) : 0;
  ctx.save(); ctx.translate(shx, -s.cam + shy);

  // Vạch mốc độ cao
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.font = '11px system-ui'; ctx.textAlign = 'left';
  for (let m = Math.ceil((GROUND - HALF - (s.cam + H)) / 500) * 50; m * 10 < GROUND - s.cam + 20; m += 50) {
    if (m <= 0) continue;
    const yy = GROUND - HALF - m * 10; ctx.fillRect(0, yy, 14, 1); ctx.fillText(m + 'm', 4, yy - 3);
  }

  for (const [x, y, w, mv, gr] of s.plats) {
    if (gr) {
      const g = ctx.createLinearGradient(0, y, 0, y + 70);
      g.addColorStop(0, '#3a2f74'); g.addColorStop(1, '#140d2c');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, 80);
      ctx.fillStyle = '#8f80ff'; ctx.fillRect(x, y, w, 3);
      continue;
    }
    const g = ctx.createLinearGradient(0, y, 0, y + 14);
    g.addColorStop(0, mv ? '#34c6bd' : '#7064e0'); g.addColorStop(1, mv ? '#124f58' : '#2a2361');
    ctx.fillStyle = g; rr(x, y, w, 14, 7); ctx.fill();
    ctx.save(); ctx.shadowColor = mv ? '#4fe0d0' : '#a99cff'; ctx.shadowBlur = 12;
    ctx.fillStyle = mv ? '#b2fff5' : '#d6ceff'; rr(x + 5, y + 1, w - 10, 3, 1.5); ctx.fill(); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    for (let i = x + 12; i < x + w - 8; i += 18) { ctx.beginPath(); ctx.arc(i, y + 9, 1.4, 0, 7); ctx.fill(); }
  }

  // Đường nhảy dự kiến khi đứng trên bục
  if (s.aim) {
    const [ax, ay, vx] = s.aim;
    for (let i = 2; i <= 16; i++) {
      const tt = i * .04, px = ax + vx * tt, py = ay - JUMP * tt + G * tt * tt / 2;
      ctx.globalAlpha = (1 - i / 18) * (.45 + .3 * Math.sin(s.t * 8 - i * .7));
      ctx.fillStyle = '#9ff8ff'; ctx.beginPath(); ctx.arc(px, py, 2.6 - i * .08, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  if (s.g) {
    drawBody(s.g[0], s.g[1], 1, 1, .28, '#ffffff');
    ctx.globalAlpha = .45; ctx.fillStyle = '#fff'; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('KỶ LỤC', s.g[0], s.g[1] - HALF - 6); ctx.globalAlpha = 1;
  }

  for (const o of s.objs) drawObj(o, s);

  // Mũi tên cảnh báo vật thể sắp rơi vào màn hình
  for (const [type, x, y, r] of s.objs) {
    const d = s.cam - (y + r);
    if (d <= 0 || d > 160) continue;
    const col = type === 'shard' ? TYPES.split.color : TYPES[type].color;
    const k = 1 - d / 160, wy = s.cam + 6 + Math.sin(s.t * 14) * 1.5;
    ctx.globalAlpha = .35 + k * .6; ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x - 7, wy); ctx.lineTo(x + 7, wy); ctx.lineTo(x, wy + 9 + k * 3); ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const [x, y, r, a] of s.shocks) {
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = 'rgba(255,154,46,.25)'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.strokeStyle = '#ffd08a'; ctx.lineWidth = 4; ctx.stroke();
  }
  ctx.globalAlpha = 1;

  (s.trail || []).forEach(([tx, ty], i, a) => drawBody(tx, ty, 1, 1, .05 + i / a.length * .15, '#5ef0ff'));
  if (s.p) {
    const [px, py, pd, psq, ground, inv, cd] = s.p;
    if (inv) {   // vòng khiên khi đang lướt né
      ctx.save(); ctx.strokeStyle = '#bff9ff'; ctx.lineWidth = 2; ctx.shadowColor = '#5ef0ff'; ctx.shadowBlur = 14;
      ctx.globalAlpha = .7; ctx.beginPath(); ctx.arc(px, py, HALF + 8, 0, 7); ctx.stroke(); ctx.restore();
    }
    drawBody(px, py, pd, psq, 1, inv ? '#e6feff' : '#5ef0ff', !ground);
    if (cd > 0) {   // thanh hồi chiêu lướt né
      ctx.fillStyle = 'rgba(0,0,0,.45)'; rr(px - 14, py + HALF + 5, 28, 4, 2); ctx.fill();
      ctx.fillStyle = '#5ef0ff'; rr(px - 14, py + HALF + 5, 28 * (1 - cd), 4, 2); ctx.fill();
    }
  }

  for (const [x, y, sz, c, a] of s.parts) { ctx.globalAlpha = a; ctx.fillStyle = c; ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz); }
  ctx.globalAlpha = 1;

  // Dung nham
  const ly = s.lava, bottom = s.cam + H + 120;
  const glow = ctx.createLinearGradient(0, ly - 90, 0, ly);
  glow.addColorStop(0, 'rgba(255,80,0,0)'); glow.addColorStop(1, 'rgba(255,90,0,.4)');
  ctx.fillStyle = glow; ctx.fillRect(0, ly - 90, W, 90);
  const lg = ctx.createLinearGradient(0, ly, 0, ly + 120);
  lg.addColorStop(0, '#ffb02e'); lg.addColorStop(.25, '#ff4d1f'); lg.addColorStop(1, '#7a0d12');
  ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(-10, bottom);
  for (let x = -10; x <= W + 10; x += 10) ctx.lineTo(x, ly + Math.sin(x * .05 + s.t * 4) * 5 + Math.sin(x * .13 - s.t * 3) * 3);
  ctx.lineTo(W + 10, bottom); ctx.fill();
  ctx.fillStyle = 'rgba(255,230,120,.7)';
  for (let i = 0; i < 6; i++) {
    const bx = (i * 79 + s.t * 20) % W, by = ly + 14 + ((i * 37 + s.t * 30) % 50);
    ctx.beginPath(); ctx.arc(bx, by, 2 + (i % 3), 0, 7); ctx.fill();
  }

  ctx.textAlign = 'center';
  for (const [x, y, txt, c, a, sz] of s.texts) {
    ctx.globalAlpha = a; ctx.font = `900 ${sz}px system-ui`;
    ctx.fillStyle = '#000'; ctx.fillText(txt, x + 2, y + 2); ctx.fillStyle = c; ctx.fillText(txt, x, y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Cảnh báo dung nham gần
  if (s.p) {
    const d = s.lava - s.p[1];
    if (d < 220) {
      const a = (1 - d / 220) * (.5 + .3 * Math.sin(s.t * 12));
      const v = ctx.createRadialGradient(W / 2, H / 2, H * .3, W / 2, H / 2, H * .75);
      v.addColorStop(0, 'rgba(255,40,0,0)'); v.addColorStop(1, `rgba(255,40,0,${a})`);
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    }
  }

  // HUD
  const hd = s.hud;
  ctx.textAlign = 'center';
  pill(W / 2 - 70, 12, 140, 56, 'rgba(255,207,63,.7)');
  ctx.font = 'bold 10px system-ui'; ctx.fillStyle = '#ffcf3f'; ctx.fillText('ĐIỂM', W / 2, 28);
  ctx.font = '900 30px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText(hd.score, W / 2, 58);
  pill(12, 22, 88, 34); pill(W - 100, 22, 88, 34);
  ctx.font = 'bold 15px system-ui';
  ctx.fillStyle = '#9ff8ff'; ctx.fillText('▲ ' + Math.floor(hd.maxH) + 'm', 56, 44);
  ctx.fillStyle = '#e6e1ff'; ctx.fillText('⏱ ' + Math.floor(hd.time) + 's', W - 56, 44);
  if (hd.combo > 1) {
    const cs = 1 + Math.min(hd.combo, 8) * .03;
    ctx.save(); ctx.translate(W / 2, 92); ctx.scale(cs, cs);
    pill(-62, -15, 124, 30, 'rgba(255,224,102,.9)');
    ctx.font = '900 17px system-ui'; ctx.fillStyle = '#ffe066'; ctx.fillText('🔥 COMBO x' + hd.combo, 0, 6);
    ctx.restore();
  }
  if (!opt.replay) {
    const v = Math.floor(hd[daily.k] || 0), ok = v >= daily.goal || dailyDone();
    const txt = '🎯 ' + daily.text + '  ' + (ok ? '✔' : Math.min(v, daily.goal) + '/' + daily.goal);
    ctx.font = '12px system-ui';
    const tw = ctx.measureText(txt).width + 24, ty = hd.combo > 1 ? 128 : 92;
    pill(W / 2 - tw / 2, ty - 15, tw, 22, ok ? 'rgba(61,220,132,.7)' : null);
    ctx.fillStyle = ok ? '#3ddc84' : 'rgba(255,255,255,.75)'; ctx.fillText(txt, W / 2, ty);
  }

  if (opt.replay) {
    ctx.textAlign = 'left'; ctx.font = '900 16px system-ui';
    if (Math.floor(performance.now() / 400) % 2) { ctx.fillStyle = '#ff3d5a'; ctx.beginPath(); ctx.arc(22, 84, 6, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.fillText(opt.slow ? 'REPLAY · SLOW-MO' : 'REPLAY', 34, 90);
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, H - 46, W, 46);
    ctx.fillStyle = '#ffcf3f'; ctx.font = '900 18px system-ui';
    ctx.fillText('NÉ ĐI!  ·  ' + lastResult.score + ' điểm  ·  Bạn né được không?', W / 2, H - 17);
  }
  ctx.restore();   // bỏ vùng cắt khung chơi
}

// Hai bên khung chơi trên màn hình rộng (laptop/PC/iPad ngang): nền tối + viền sáng
function drawSides() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, cv.height);
  g.addColorStop(0, '#120a2a'); g.addColorStop(1, '#2a0f24');
  ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
  if (offX <= 0) return;
  const x0 = offX * scale, x1 = (offX + W) * scale;
  ctx.fillStyle = 'rgba(255,255,255,.035)';
  for (let y = (performance.now() / 40) % 60 * scale; y < cv.height; y += 60 * scale) {
    ctx.fillRect(x0 - 40 * scale, y, 24 * scale, 2 * scale);
    ctx.fillRect(x1 + 16 * scale, y, 24 * scale, 2 * scale);
  }
  ctx.save(); ctx.shadowColor = '#7a6cff'; ctx.shadowBlur = 18 * scale;
  ctx.fillStyle = 'rgba(160,150,255,.55)';
  ctx.fillRect(x0 - 3 * scale, 0, 3 * scale, cv.height); ctx.fillRect(x1, 0, 3 * scale, cv.height);
  ctx.restore();
}

// ---------- Kết thúc lượt ----------
function gameOver() {
  mode = 'over'; playUI(false);
  const score = curScore(), before = new Set(unlockedTitles());
  const newBest = score > stats.bestScore;
  stats.runs++; stats.dodges += run.dodges; stats.nears += run.nears;
  stats.bestH = Math.max(stats.bestH, run.maxH); stats.bestTime = Math.max(stats.bestTime, run.time);
  stats.bestCombo = Math.max(stats.bestCombo, run.maxCombo);
  if (newBest) { stats.bestScore = score; store.set('ghost', ghostRec); }

  let dailyNow = false;
  if (!dailyDone() && (run[daily.k] || 0) >= daily.goal) {
    store.set('dailyDone', dayKey()); stats.dailyCount++; dailyNow = true;
  }
  store.set('stats', stats);
  const fresh = unlockedTitles().filter(x => !before.has(x));
  lastResult = { score, newBest, run: { ...run }, reason: deathReason, fresh };

  $('oReason').textContent = DEATH_MSG[deathReason] || 'Toang!';
  $('oScore').textContent = score;
  $('oBest').classList.toggle('hidden', !newBest);
  $('oStats').innerHTML = [
    ['Độ cao', Math.floor(run.maxH) + 'm'], ['Đã né', run.dodges], ['Suýt chết', run.nears],
    ['Combo max', 'x' + run.maxCombo], ['Thời gian', Math.floor(run.time) + 's'], ['Kỷ lục', stats.bestScore],
  ].map(([a, b]) => `<div><b>${b}</b>${a}</div>`).join('');
  $('oDaily').innerHTML = dailyDone()
    ? `🎯 Thử thách hôm nay: ${daily.text}<br><span class="done">${dailyNow ? 'HOÀN THÀNH! 🎉' : 'Đã hoàn thành ✔'}</span>`
    : `🎯 Thử thách hôm nay: ${daily.text}<br>Lượt này: ${Math.floor(run[daily.k] || 0)}/${daily.goal}`;
  $('oTitles').innerHTML = fresh.map(x => `<span class="chip new">🏅 ${x}</span>`).join('');
  $('over').classList.remove('hidden');
  if (newBest) sfx(880, .4, 'triangle', .07, 600);
}

function currentTitle() { const u = unlockedTitles(); return u[u.length - 1] || 'Tân binh'; }

function showMenu() {
  mode = 'menu'; reset(); playUI(false); $('pause').classList.add('hidden');
  $('over').classList.add('hidden'); $('menu').classList.remove('hidden');
  $('legend').innerHTML = Object.values(TYPES)
    .map(o => `<div><i style="background:${o.color};color:${o.color}"></i><span><b>${o.name}</b>${o.desc}</span></div>`).join('');
  $('mDaily').innerHTML = `🎯 <b>Thử thách hôm nay</b><br>${daily.text}` + (dailyDone() ? '<br><span class="done">Đã hoàn thành ✔</span>' : '');
  $('mBest').innerHTML = `Kỷ lục: <b>${stats.bestScore}</b> · Cao nhất: <b>${Math.floor(stats.bestH)}m</b> · ${stats.runs} lượt`;
  const u = new Set(unlockedTitles());
  $('mTitles').innerHTML = TITLES.map(([n, d]) => `<span class="chip ${u.has(n) ? 'on' : ''}" title="${d}">${u.has(n) ? '🏅' : '🔒'} ${n}</span>`).join('');
}

function start() {
  initAudio(); reset(); mode = 'play';
  input.left = input.right = input.down = false;
  $('menu').classList.add('hidden'); $('over').classList.add('hidden'); playUI(true);
}

// Hiện/ẩn nút điều khiển + nút góc trong lúc chơi
function playUI(on) {
  $('pad').classList.toggle('hidden', !on);
  $('ctl').classList.toggle('hidden', !on);
  if (!on) document.querySelectorAll('#pad button').forEach(b => b.classList.remove('on'));
}

// ---------- Tạm dừng (tự dừng khi chuyển tab / ẩn app / mất focus) ----------
function pause() {
  if (mode !== 'play') return;
  mode = 'pause'; input.left = input.right = input.down = false;
  document.querySelectorAll('#pad button').forEach(b => b.classList.remove('on'));
  $('pad').classList.add('hidden'); $('pause').classList.remove('hidden');
}
function resume() {
  if (mode !== 'pause') return;
  mode = 'play'; last = performance.now(); acc = 0;
  $('pause').classList.add('hidden'); $('pad').classList.remove('hidden');
}
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// ---------- Toàn màn hình ----------
const docEl = document.documentElement;
const reqFS = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
function toggleFullscreen() {
  const d = document;
  try {
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else { const r = reqFS.call(docEl); if (r && r.catch) r.catch(() => {}); }
  } catch (e) {}
}
if (!reqFS) $('bFull').classList.add('hidden');   // iPhone không hỗ trợ: ẩn nút

// ---------- Phóng to màn hình game ----------
function updateZoomLabels() {
  const pct = Math.round(zoom * 100) + '%';
  $('bZoom').textContent = '🔍 Phóng to: ' + pct;
  $('bZoom2').title = 'Phóng to: ' + pct;
}
function cycleZoom() {
  zoom = ZOOMS[(ZOOMS.indexOf(zoom) + 1) % ZOOMS.length];
  store.set('zoom', zoom);
  onResize(); updateZoomLabels();
  toast('🔍 Phóng to ' + Math.round(zoom * 100) + '%');
}

// ---------- Xoay màn hình điện thoại (ngang ⇄ dọc) ----------
async function rotateScreen() {
  const so = screen.orientation;
  const portrait = so && so.type ? so.type.startsWith('portrait') : innerHeight > innerWidth;
  const want = portrait ? 'landscape' : 'portrait';
  try {
    // Android: chỉ khoá xoay được khi đang toàn màn hình
    if (!(document.fullscreenElement || document.webkitFullscreenElement) && reqFS) await reqFS.call(docEl);
    await so.lock(want);
    toast(want === 'landscape' ? '🔄 Đã xoay ngang' : '🔄 Đã xoay dọc');
  } catch (e) {
    // iPhone / trình duyệt không cho khoá: hướng dẫn xoay tay
    toast('Tắt "Khoá xoay màn hình" rồi xoay điện thoại ' + (want === 'landscape' ? 'ngang' : 'dọc'));
  }
}

// ---------- Tay cầm (gamepad) cho PC / laptop ----------
const gpPrev = {};
function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null;
  for (const p of pads) if (p && p.connected) { gp = p; break; }
  if (!gp) { input.gpLeft = input.gpRight = input.gpDown = false; return; }
  const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  const edge = (k, v) => { const e = v && !gpPrev[k]; gpPrev[k] = v; return e; };
  input.gpLeft = ax < -.4 || b(14);
  input.gpRight = ax > .4 || b(15);
  const down = ay > .6 || b(13);
  if (edge('down', down) && pl) pl.dropBuf = BUFFER;
  input.gpDown = down;
  if (edge('jump', b(0) || b(12))) {   // A / D-pad lên
    initAudio();
    if (mode === 'play') jump(); else if (mode === 'menu' || mode === 'over') start(); else if (mode === 'pause') resume();
  }
  if (edge('dash', b(1) || b(2) || b(5) || b(7))) dash(inputDir() || pl.dir);   // B / X / RB / RT
  if (edge('start', b(9))) { if (mode === 'play') pause(); else if (mode === 'pause') resume(); }
}
addEventListener('gamepadconnected', () => { setTouch(false); toast('🎮 Đã kết nối tay cầm'); });

// ---------- Replay & quay clip ----------
const rp = { i: 0, rt: 0, end: 0, record: false, rec: null, chunks: [] };

function startReplay(record) {
  if (!frames.length) return;
  if (record && !startRec()) return;
  $('over').classList.add('hidden');
  mode = 'replay'; rp.i = 0; rp.rt = frames[0].ft; rp.end = frames[frames.length - 1].ft; rp.record = record;
}
function stepReplay(raw) {
  const slow = rp.rt > rp.end - 1.6;
  rp.rt += raw * (slow ? .35 : 1);
  while (rp.i < frames.length - 1 && frames[rp.i + 1].ft <= rp.rt) rp.i++;
  render(frames[rp.i].s, { replay: true, slow });
  if (rp.rt >= rp.end) {
    if (rp.record && rp.rec) { rp.rec.stop(); rp.rec = null; }
    mode = 'over'; $('over').classList.remove('hidden');
  }
}
function startRec() {
  try {
    const stream = cv.captureStream(30);
    const types = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    const mt = types.find(x => window.MediaRecorder && MediaRecorder.isTypeSupported(x));
    const rec = new MediaRecorder(stream, mt ? { mimeType: mt, videoBitsPerSecond: 4e6 } : undefined);
    rp.chunks = [];
    rec.ondataavailable = e => { if (e.data.size) rp.chunks.push(e.data); };
    rec.onstop = () => {
      const type = rec.mimeType || 'video/webm', blob = new Blob(rp.chunks, { type });
      shareOrDownload(blob, 'ne-di-clip.' + (type.includes('mp4') ? 'mp4' : 'webm'));
    };
    rec.start(); rp.rec = rec;
    return true;
  } catch (e) { toast('Trình duyệt này không hỗ trợ quay clip'); return false; }
}

// ---------- Chia sẻ ----------
const shareText = () => `Mình được ${lastResult.score} điểm, leo ${Math.floor(lastResult.run.maxH)}m trong NÉ ĐI! Bạn né được không? 🔥`;

async function shareOrDownload(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Né Đi!', text: shareText() });
      return;
    }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('Đã lưu ' + name);
}

function makeCard() {
  // Lấy khung hình ~0.3s trước khi chết (khoảnh khắc suýt chết)
  const deathAt = frames[frames.length - 1].ft - 1.1 - .3;
  const fr = frames.find(f => f.ft >= deathAt) || frames[frames.length - 1];
  render(fr.s);
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, 1350); bg.addColorStop(0, '#26164f'); bg.addColorStop(1, '#5a1830');
  g.fillStyle = bg; g.fillRect(0, 0, 1080, 1350);
  g.textAlign = 'center'; g.fillStyle = '#ffcf3f'; g.font = '900 120px system-ui'; g.fillText('NÉ ĐI!', 540, 160);
  // Chỉ cắt phần khung chơi (bỏ 2 bên trang trí), giữ đúng tỉ lệ
  let sw = 500, sh = sw * H / W;
  if (sh > 1000) { sh = 1000; sw = sh * W / H; }
  g.save(); g.shadowColor = '#000'; g.shadowBlur = 40;
  g.drawImage(cv, offX * scale, 0, W * scale, H * scale, 60, 230, sw, sh); g.restore();
  g.strokeStyle = '#ffcf3f'; g.lineWidth = 6; g.strokeRect(60, 230, sw, sh);
  const r = lastResult.run, x = 820;
  g.fillStyle = '#c9c4ef'; g.font = 'bold 40px system-ui'; g.fillText('ĐIỂM', x, 320);
  g.fillStyle = '#fff'; g.font = '900 150px system-ui'; g.fillText(lastResult.score, x, 460);
  if (lastResult.newBest) { g.fillStyle = '#ff3d5a'; g.font = '900 38px system-ui'; g.fillText('KỶ LỤC MỚI!', x, 520); }
  const rows = [['Độ cao', Math.floor(r.maxH) + 'm'], ['Đã né', r.dodges], ['Suýt chết', r.nears], ['Combo', 'x' + r.maxCombo], ['Sống sót', Math.floor(r.time) + 's']];
  rows.forEach(([a, b], i) => {
    const y = 620 + i * 110;
    g.fillStyle = '#a9a3d6'; g.font = 'bold 34px system-ui'; g.fillText(a, x, y);
    g.fillStyle = '#fff'; g.font = '900 56px system-ui'; g.fillText(b, x, y + 56);
  });
  g.fillStyle = '#5ef0ff'; g.font = 'bold 44px system-ui'; g.fillText('🏅 ' + currentTitle(), 540, 1240);
  g.fillStyle = '#fff'; g.font = '900 46px system-ui'; g.fillText('Bạn né được không?', 540, 1310);
  render(frames[frames.length - 1].s);
  return new Promise(res => c.toBlob(res, 'image/png'));
}

let toastTimer;
function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}

// ---------- Input ----------
// Chạm bất kỳ đâu trên màn hình (trừ các nút) để nhảy
addEventListener('pointerdown', e => {
  if (e.target.closest && e.target.closest('button, #pad, #ctl, .overlay')) return;
  initAudio();
  if (mode === 'play') { jump(); e.preventDefault(); }
  else if (mode === 'replay' && !rp.record) rp.rt = rp.end;
}, { passive: false });
const HOLD_KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowDown: 'down', KeyS: 'down' };
addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (mode === 'play') pause(); else if (mode === 'pause') resume();
    return;
  }
  if (e.code === 'KeyF' && !e.repeat) { toggleFullscreen(); return; }
  if (HOLD_KEYS[e.code]) {
    e.preventDefault();
    if (HOLD_KEYS[e.code] === 'down' && !e.repeat && pl) pl.dropBuf = BUFFER;
    input[HOLD_KEYS[e.code]] = true; return;
  }
  if (['ShiftLeft', 'ShiftRight', 'KeyK', 'KeyJ'].includes(e.code)) {
    e.preventDefault(); if (!e.repeat) dash(inputDir() || pl.dir); return;
  }
  if (!['Space', 'ArrowUp', 'KeyW', 'Enter'].includes(e.code)) return;
  e.preventDefault(); if (e.repeat) return;
  initAudio();
  if (mode === 'play') jump();
  else if (mode === 'menu' || mode === 'over') start();
  else if (mode === 'pause') resume();
});
addEventListener('keyup', e => { if (HOLD_KEYS[e.code]) input[HOLD_KEYS[e.code]] = false; });
addEventListener('blur', () => { input.left = input.right = input.down = false; pause(); });

// Chặn menu chuột phải, phóng to bằng 2 ngón (iOS) và nhấn giữ hiện menu
cv.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());

// Nút góc: không để chạm vào nút bị tính thành nhảy
$('ctl').addEventListener('pointerdown', e => e.stopPropagation());
$('bPause').onclick = () => { if (mode === 'play') pause(); else resume(); };
$('bFull').onclick = toggleFullscreen;
$('bZoom').onclick = $('bZoom2').onclick = cycleZoom;
$('bRot').onclick = $('bRot2').onclick = rotateScreen;
updateZoomLabels();
$('bResume').onclick = resume;
$('bQuit').onclick = showMenu;

// Nút cảm ứng: ◀ ▶ ▼ giữ để di chuyển, ▲ để nhảy
document.querySelectorAll('#pad button').forEach(b => {
  const k = b.dataset.k;
  const press = on => e => {
    e.preventDefault(); e.stopPropagation();
    if (on) initAudio();
    if (k === 'up') { if (on && mode === 'play') jump(); }
    else if (k === 'dash') { if (on) dash(inputDir() || pl.dir); }
    else {
      if (on && k === 'down' && pl) pl.dropBuf = BUFFER;   // chạm nhanh ▼ cũng rơi xuyên bục
      input[k] = on;
    }
    b.classList.toggle('on', on);
  };
  b.addEventListener('pointerdown', press(true));
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, press(false)));
  b.addEventListener('contextmenu', e => e.preventDefault());
});
$('bStart').onclick = start;
$('bAgain').onclick = start;
$('bMenu').onclick = showMenu;
$('bReplay').onclick = () => startReplay(false);
$('bClip').onclick = () => startReplay(true);
$('bShare').onclick = async () => shareOrDownload(await makeCard(), 'ne-di-' + lastResult.score + '.png');

// ---------- Vòng lặp chính ----------
// Vật lý chạy bước cố định 1/120s để chuyển động đều trên mọi máy
const STEP = 1 / 120;
let last = performance.now(), acc = 0;
let ftAvg = 16, slowFor = 0;
function loop(now) {
  // Giới hạn 60 khung hình/giây: màn 120/144Hz không vẽ thừa → đỡ tốn pin, đỡ nóng máy
  if (now - last < 1000 / 62) { requestAnimationFrame(loop); return; }
  const ms = Math.min(100, now - last);
  const raw = Math.min(.033, ms / 1000); last = now;
  pollGamepad();
  // Máy chạy chậm (< ~42 fps) liên tục 2 giây → hạ một mức chất lượng (cao → vừa → thấp)
  if (mode === 'play' && tier < 2) {
    ftAvg = ftAvg * .95 + ms * .05;
    slowFor = ftAvg > 24 ? slowFor + raw : 0;
    if (slowFor > 2) {
      tier++; lowFx = tier >= 2; slowFor = 0; ftAvg = 16;
      resize();
      toast(tier === 1 ? '⚡ Đã giảm hiệu ứng cho mượt hơn' : '⚡ Đã bật chế độ mượt cho máy yếu');
    }
  }
  if (mode === 'play' || mode === 'dying') {
    acc += raw * (slowT > 0 ? .35 : 1); slowT -= raw;
    for (let n = 0; acc >= STEP && n < 8; n++) { update(STEP); acc -= STEP; }
    frames.push({ ft: t, s: snap() });
    while (frames.length && frames[0].ft < t - 5) frames.shift();
    render(frames[frames.length - 1].s);
    if (mode === 'dying') { deathT += raw; if (deathT > 1.1) gameOver(); }
  } else if (mode === 'replay') {
    stepReplay(raw);
  } else if (mode === 'menu') {
    const s = snap(); s.t = now / 1000; render(s);
  }
  requestAnimationFrame(loop);
}
showMenu();
requestAnimationFrame(loop);
