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

// Envelope: a plain fade for now. The doors → alley video replaces it once it is generated.
const envelope = document.getElementById('envelope');
envelope.querySelector('.envelope__open').addEventListener('click', async () => {
  const fade = envelope.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: reduceMotion ? 0 : 600,
    easing: 'ease',
  });
  await fade.finished;
  envelope.hidden = true;
  root.classList.remove('is-locked');
  window.scrollTo(0, 0);
  topbar.hidden = false;
}, { once: true });

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
