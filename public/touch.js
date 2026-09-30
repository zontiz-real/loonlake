// Touch controls: a floating stick on the left half, drag to look on the right,
// and a cluster of context buttons. Only shown on touch devices.
export function initTouch(h) {
  const root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML = `
    <div class="tzone" id="tzLeft"></div>
    <div class="tzone" id="tzRight"></div>
    <div id="stick" hidden><div id="knob"></div></div>
    <div id="tButtons">
      <button type="button" class="tbtn small" id="tReel" hidden>Reel in</button>
      <button type="button" class="tbtn small" id="tUse" hidden>Use</button>
      <button type="button" class="tbtn" id="tShoot" hidden>Shoot</button>
      <button type="button" class="tbtn big" id="tFish">Cast</button>
    </div>
    <div id="tTop">
      <button type="button" class="tbtn tiny" id="tJournal">Phone</button>
      <button type="button" class="tbtn tiny" id="tChat">Chat</button>
      <button type="button" class="tbtn tiny" id="tHelp">Help</button>
      <button type="button" class="tbtn tiny" id="tFull" hidden>Full screen</button>
    </div>`;
  document.body.append(root);

  const state = { mx: 0, mz: 0, lookDX: 0, lookDY: 0, sprint: false };
  const $ = (id) => root.querySelector('#' + id);
  const stick = $('stick');
  const knob = $('knob');
  const R = 52;
  let stickId = null;
  let sx = 0;
  let sy = 0;
  let lookId = null;
  let lx = 0;
  let ly = 0;

  const left = $('tzLeft');
  left.addEventListener('pointerdown', (e) => {
    if (stickId !== null) return;
    h.unlock();
    stickId = e.pointerId;
    left.setPointerCapture(e.pointerId);
    sx = e.clientX; sy = e.clientY;
    stick.hidden = false;
    stick.style.left = sx + 'px';
    stick.style.top = sy + 'px';
    knob.style.transform = 'translate(-50%, -50%)';
  });
  left.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - sx;
    let dy = e.clientY - sy;
    const len = Math.hypot(dx, dy);
    if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    state.mx = dx / R;
    state.mz = -dy / R;
    state.sprint = len > R * 1.25;
  });
  const endStick = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    state.mx = state.mz = 0;
    state.sprint = false;
    stick.hidden = true;
  };
  left.addEventListener('pointerup', endStick);
  left.addEventListener('pointercancel', endStick);

  const right = $('tzRight');
  right.addEventListener('pointerdown', (e) => {
    if (lookId !== null) return;
    h.unlock();
    lookId = e.pointerId;
    right.setPointerCapture(e.pointerId);
    lx = e.clientX; ly = e.clientY;
  });
  right.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookId) return;
    state.lookDX += e.clientX - lx;
    state.lookDY += e.clientY - ly;
    lx = e.clientX; ly = e.clientY;
  });
  const endLook = (e) => { if (e.pointerId === lookId) lookId = null; };
  right.addEventListener('pointerup', endLook);
  right.addEventListener('pointercancel', endLook);

  const press = (id, down, up) => {
    const el = $(id);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      h.unlock();
      el.classList.add('down');
      el.setPointerCapture(e.pointerId);
      if (down) down();
    });
    const release = (e) => {
      if (!el.classList.contains('down')) return;
      e.preventDefault();
      el.classList.remove('down');
      if (up) up();
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  press('tFish', h.fishDown, h.fishUp);
  press('tShoot', null, h.shoot);
  press('tUse', null, h.use);
  press('tReel', null, h.reelIn);
  press('tJournal', null, h.phone);
  press('tChat', null, h.chat);
  press('tHelp', null, h.help);
  // Android and desktop Chrome allow real fullscreen; iPhones use Add to Home Screen instead
  const full = $('tFull');
  const doc = document.documentElement;
  if (document.fullscreenEnabled && doc.requestFullscreen) {
    full.hidden = false;
    press('tFull', null, () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else doc.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    });
    document.addEventListener('fullscreenchange', () => { full.textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen'; });
  }

  return {
    state,
    // takes the look delta accumulated since the last frame
    takeLook() {
      const d = { x: state.lookDX, y: state.lookDY };
      state.lookDX = state.lookDY = 0;
      return d;
    },
    sync(ctx) {
      $('tFish').textContent = ctx.fishLabel;
      $('tFish').classList.toggle('alert', ctx.fishAlert);
      $('tShoot').hidden = !ctx.attackLabel;
      if (ctx.attackLabel) $('tShoot').textContent = ctx.attackLabel;
      $('tUse').hidden = !ctx.useLabel;
      if (ctx.useLabel) $('tUse').textContent = ctx.useLabel;
      $('tReel').hidden = !ctx.canReelIn;
    },
  };
}
