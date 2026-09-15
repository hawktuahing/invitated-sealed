const root = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

// Header: hides while scrolling down, slides back on the way up, and turns ink over cream screens.
const topbar = document.querySelector('.topbar');
const lightScreens = [...document.querySelectorAll('[data-tone="light"]')];
let lastScrollY = 0;
let topbarQueued = false;

function updateTopbar() {
  topbarQueued = false;
  const y = window.scrollY;
  if (Math.abs(y - lastScrollY) > 4) {
    topbar.classList.toggle('is-hidden', y > lastScrollY && y > topbar.offsetHeight);
    lastScrollY = y;
  }
  const middle = topbar.offsetHeight / 2;
  topbar.classList.toggle('is-light', lightScreens.some((screen) => {
    const { top, bottom } = screen.getBoundingClientRect();
    return top <= middle && bottom > middle;
  }));
}

window.addEventListener('scroll', () => {
  if (topbar.hidden || topbarQueued) return;
  topbarQueued = true;
  requestAnimationFrame(updateTopbar);
}, { passive: true });

// Envelope: the seal cracks, then every flap unfolds on its own beat while the cover settles in underneath.
const envelope = document.getElementById('envelope');
const cover = document.getElementById('cover');

// One flap: it sticks for a moment, lifts toward the viewer, turns edge-on and folds away showing its inside.
function unfoldFlap(selector, [rest, unstick, edgeOn, away], timing) {
  const flap = envelope.querySelector(selector);
  const options = { ...timing, easing: 'linear', fill: 'forwards' };
  return [
    flap.animate([
      { transform: rest, easing: 'cubic-bezier(0.5, 0, 0.7, 0.4)' },
      { transform: unstick, offset: 0.18, easing: 'cubic-bezier(0.3, 0.1, 0.6, 1)' },
      { transform: edgeOn, offset: 0.6, easing: 'cubic-bezier(0.25, 0, 0.3, 1)' },
      { transform: away },
    ], options),
    // Paper darkens as it tilts away from the light; the inside brightens as it comes round.
    flap.querySelector('.flap__front').animate([
      { filter: 'brightness(1)' },
      { filter: 'brightness(1)', offset: 0.18 },
      { filter: 'brightness(0.78)', offset: 0.6 },
      { filter: 'brightness(0.7)' },
    ], options),
    flap.querySelector('.flap__back').animate([
      { filter: 'brightness(0.72)' },
      { filter: 'brightness(0.72)', offset: 0.6 },
      { filter: 'brightness(1)' },
    ], options),
  ];
}

function crackSeal(half, drift, delay) {
  return envelope.querySelector(`.seal--${half} img`).animate([
    { transform: 'none', easing: 'cubic-bezier(0.3, 0, 0.6, 1)' },
    { transform: 'scale(0.95)', offset: 0.4, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    { transform: drift },
  ], { duration: 380, delay, fill: 'forwards' });
}

async function openEnvelope() {
  envelope.classList.add('is-opening');

  if (reduceMotion) {
    await envelope.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).finished;
  } else {
    const moves = [
      envelope.querySelector('.envelope__hint').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' }),
      crackSeal('top', 'translate(-1px, -4px) rotate(-3deg)', 0),
      crackSeal('bottom', 'translate(2px, 5px) rotate(2deg)', 20),
      ...unfoldFlap('.flap--top', [
        'translateZ(3px) rotateX(0deg)',
        'translateZ(3px) translateY(-0.4%) rotateX(10deg)',
        'translateZ(3px) translateY(-9%) rotateX(96deg)',
        'translateZ(3px) translateY(-45%) rotateX(170deg)',
      ], { duration: 1250, delay: 340 }),
      ...unfoldFlap('.flap--left', [
        'rotateY(0deg)',
        'translateX(-0.6%) rotateY(-8deg)',
        'translateX(-12%) rotateY(-98deg)',
        'translateX(-48%) rotateY(-164deg)',
      ], { duration: 1150, delay: 720 }),
      ...unfoldFlap('.flap--right', [
        'rotateY(0deg)',
        'translateX(0.5%) rotateY(7deg)',
        'translateX(11%) rotateY(94deg)',
        'translateX(46%) rotateY(160deg)',
      ], { duration: 1220, delay: 820 }),
      ...unfoldFlap('.flap--bottom', [
        'translateZ(1.5px) rotateX(0deg)',
        'translateZ(1.5px) translateY(0.5%) rotateX(-9deg)',
        'translateZ(1.5px) translateY(10%) rotateX(-97deg)',
        'translateZ(1.5px) translateY(46%) rotateX(-168deg)',
      ], { duration: 1320, delay: 980 }),
      envelope.querySelector('.envelope__shade').animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 1500, delay: 700, easing: 'ease-out', fill: 'forwards',
      }),
      cover.querySelector('.cover__card').animate([
        { transform: 'translateY(16px) scale(0.94)', opacity: 0.5 },
        { transform: 'none', opacity: 1 },
      ], { duration: 1600, delay: 650, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: 'backwards' }),
      cover.querySelector('.cover__bg').animate([{ scale: '1.08' }, { scale: '1' }], {
        duration: 2400, delay: 400, easing: 'cubic-bezier(0.2, 0.6, 0.2, 1)', fill: 'backwards',
      }),
    ];
    await Promise.all(moves.map((move) => move.finished));
  }

  envelope.hidden = true;
  root.classList.remove('is-locked');
  window.scrollTo(0, 0);
  topbar.hidden = false;
  if (!reduceMotion) topbar.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: 'ease' });
}

envelope.querySelector('.envelope__open').addEventListener('click', openEnvelope, { once: true });

// Scratch card: wiping the heart away reveals the date, and once it is empty a party popper fires from below.
const date = document.getElementById('date');
const heart = date.querySelector('.date__heart');
const heartImg = heart.querySelector('img');
const scratch = heart.querySelector('.date__scratch');
const burst = date.querySelector('.date__burst');

const SCRATCH_RADIUS = 22;
const REVEAL_AT = 0.7; // share of the heart wiped before the rest dissolves on its own
const FALLBACK_STROKE = 1600; // px of scratching that counts as "empty" when pixels can't be read

let scratchCtx = null;
let heartPixels = null;
let lastPoint = null;
let strokeLength = 0;
let lastMeasure = 0;
let revealed = false;

function countOpaquePixels() {
  try {
    const { data } = scratchCtx.getImageData(0, 0, scratch.width, scratch.height);
    let count = 0;
    for (let i = 3; i < data.length; i += 16) {
      if (data[i] > 32) count++;
    }
    return count;
  } catch {
    return null; // a file:// page taints the canvas
  }
}

function setupScratch() {
  const width = heart.clientWidth;
  const height = heart.clientHeight;
  scratch.width = width * pixelRatio;
  scratch.height = height * pixelRatio;
  scratchCtx = scratch.getContext('2d', { willReadFrequently: true });
  scratchCtx.scale(pixelRatio, pixelRatio);
  // Same crop as the CSS: the art is 107.27% wide and shifted 3.63% left.
  scratchCtx.drawImage(heartImg, -0.0363 * width, 0, 1.0727 * width, height);
  scratchCtx.globalCompositeOperation = 'destination-out';
  scratchCtx.lineCap = 'round';
  scratchCtx.lineJoin = 'round';
  scratchCtx.lineWidth = SCRATCH_RADIUS * 2;
  heartPixels = countOpaquePixels();
  heart.classList.add('is-ready');
}

function scratchTo(event) {
  const rect = scratch.getBoundingClientRect();
  const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  const from = lastPoint || { x: point.x - 0.1, y: point.y };
  scratchCtx.beginPath();
  scratchCtx.moveTo(from.x, from.y);
  scratchCtx.lineTo(point.x, point.y);
  scratchCtx.stroke();
  strokeLength += Math.hypot(point.x - from.x, point.y - from.y);
  lastPoint = point;
}

function checkProgress(force) {
  const now = performance.now();
  if (!force && now - lastMeasure < 150) return;
  lastMeasure = now;
  const left = heartPixels ? countOpaquePixels() : null;
  const wiped = left === null ? strokeLength / FALLBACK_STROKE : 1 - left / heartPixels;
  if (wiped >= REVEAL_AT) revealDate();
}

async function revealDate() {
  if (revealed) return;
  revealed = true;
  date.classList.add('is-scratching');
  // Let whatever is left of the heart melt away, then fire the popper.
  await scratch.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: reduceMotion ? 0 : 400,
    easing: 'ease-out',
    fill: 'forwards',
  }).finished;
  date.classList.add('is-revealed');
  if (!reduceMotion) firePopper();
}

if (heartImg.complete && heartImg.naturalWidth) {
  setupScratch();
} else {
  heartImg.addEventListener('load', setupScratch, { once: true });
}

scratch.addEventListener('pointerdown', (event) => {
  if (revealed || !scratchCtx) return;
  scratch.setPointerCapture(event.pointerId);
  date.classList.add('is-scratching');
  lastPoint = null;
  scratchTo(event);
});

scratch.addEventListener('pointermove', (event) => {
  if (revealed || !scratchCtx || !scratch.hasPointerCapture(event.pointerId)) return;
  scratchTo(event);
  checkProgress(false);
});

const endStroke = () => {
  lastPoint = null;
  if (!revealed && scratchCtx) checkProgress(true);
};
scratch.addEventListener('pointerup', endStroke);
scratch.addEventListener('pointercancel', endStroke);

scratch.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  revealDate();
});

// Party popper: a burst of gold and green pieces shot up from the bottom edge.
const POPPER_COLORS = ['#c9a45c', '#e3c98f', '#a8813f', '#8c967b', '#28514a', '#4f7a6c', '#f1e9da'];
const POPPER_PIECES = 160;
const POPPER_GRAVITY = 1500; // px/s²
const POPPER_DRAG = 2.2; // 1/s, so pieces flutter down instead of dropping
const POPPER_DURATION = 3.4; // s

function firePopper() {
  const width = date.clientWidth;
  const height = date.clientHeight;
  burst.width = width * pixelRatio;
  burst.height = height * pixelRatio;
  const ctx = burst.getContext('2d');
  ctx.scale(pixelRatio, pixelRatio);

  const pieces = Array.from({ length: POPPER_PIECES }, () => {
    const angle = (-90 + (Math.random() - 0.5) * 56) * (Math.PI / 180);
    const speed = 1300 + Math.random() * 1100;
    return {
      x: width * (0.5 + (Math.random() - 0.5) * 0.35),
      y: height + 12,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 6,
      strip: Math.random() < 0.35,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 14,
      flip: Math.random() * Math.PI,
      flipSpeed: 4 + Math.random() * 8,
      color: POPPER_COLORS[Math.floor(Math.random() * POPPER_COLORS.length)],
    };
  });

  let start = null;
  let previous = null;

  function frame(now) {
    if (start === null) start = previous = now;
    const dt = Math.min((now - previous) / 1000, 1 / 30);
    const elapsed = (now - start) / 1000;
    previous = now;

    ctx.clearRect(0, 0, width, height);
    if (elapsed >= POPPER_DURATION) return;
    ctx.globalAlpha = Math.min(1, (POPPER_DURATION - elapsed) / 0.8);

    for (const piece of pieces) {
      piece.vx -= piece.vx * POPPER_DRAG * dt;
      piece.vy += (POPPER_GRAVITY - piece.vy * POPPER_DRAG) * dt;
      piece.x += piece.vx * dt;
      piece.y += piece.vy * dt;
      piece.rotation += piece.spin * dt;
      piece.flip += piece.flipSpeed * dt;

      ctx.save();
      ctx.translate(piece.x, piece.y);
      ctx.rotate(piece.rotation);
      ctx.scale(1, Math.cos(piece.flip));
      ctx.fillStyle = piece.color;
      if (piece.strip) {
        ctx.fillRect(-piece.size * 0.2, -piece.size, piece.size * 0.4, piece.size * 2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, piece.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

// Music toggle: tracks state only until a track is chosen.
const sound = document.querySelector('.sound');
sound.addEventListener('click', () => {
  sound.setAttribute('aria-pressed', String(sound.getAttribute('aria-pressed') !== 'true'));
});

// RSVP: intentionally goes nowhere until the client's backend is connected.
document.querySelector('.rsvp__form').addEventListener('submit', (event) => {
  event.preventDefault();
});
