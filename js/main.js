const root = document.documentElement;

// A reload always starts over at the sealed envelope: don't let the browser restore the old scroll position.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);
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

// Envelope: a real envelope. The wax seal snaps in two along one crack, the sealed top flap bends
// open carrying the upper half of the seal, and once it has left the top of the screen the glued
// body of the envelope slides away down it. Add ?slowmo=4 to the URL to watch it slowly.
const envelope = document.getElementById('envelope');
const envelopeStage = envelope.querySelector('.envelope__stage');
const envelopeFx = envelope.querySelector('.envelope__fx');

const PAPER_SRC = 'assets/img/envelope-paper.jpg';
const SEAL_SRC = 'assets/img/envelope-seal.png';
const RAD = Math.PI / 180;
const slowmo = Math.max(1, Number(new URLSearchParams(location.search).get('slowmo')) || 1);

// Milliseconds after the tap.
const T = {
  snap: 90, // the wax snaps in two
  lift: 380, // the top flap starts to open
};
const LIFT_DURATION = 1500;
const SLIDE_DURATION = 1150;
const SLIDE_LATEST = T.lift + LIFT_DURATION + 900; // slide by then even if a corner of the flap still shows

// Crease lines measured off the photo, in percent of its 479.5×852 box. The top flap is cut into
// strips from the hinge to the tip, so it bends like paper; its last strip carries the wax. Its very
// tip ends at the crack: below that it lies under the lower half of the seal, hidden while sealed,
// and would otherwise cover that half as it lifts. Its V edges run just past the crease (see
// TOP_FLAP_EDGE.margin), so the edge's lip and shadow leave with it.
const TOP_FLAP = {
  axis: 'y', sign: 1, z: 3, gravity: 900, delay: T.lift, duration: LIFT_DURATION,
  polygon: [[0, 0], [100, 0], [100, 30.08], [60.30, 49.5], [39.60, 49.5], [0, 30.30]],
  cuts: [0, 10, 19, 27, 34, 40.5, 49.5],
};
// The side and bottom flaps are glued into the pocket and never bend. Only what lay out in the open
// is kept: everything above the top flap's edge (the flap tips it covered, plus that edge's own lip
// and shadow printed in the photo) would still read as the top flap once it has gone.
const TOP_FLAP_EDGE = {
  left: { from: [0, 29.4], to: [50, 53.64] },
  right: { from: [100, 29.18], to: [50, 53.64] },
  margin: 0.8,
};
const GLUED_FLAPS = [
  { name: 'left', z: 0, polygon: [[0, 28.9], [36.6, 46.48], [0, 65.3]] },
  { name: 'right', z: 0, polygon: [[100, 28.7], [64, 46.83], [100, 65.9]] },
  { name: 'bottom', z: 1.5, polygon: [[0, 64.79], [50, 39.3], [100, 65.38], [100, 100], [0, 100]] },
];

// The 157px seal sits dead centre on the photo.
const SEAL_BOX = { left: 50 - 7850 / 479.5, top: 50 - 7850 / 852, width: 15700 / 479.5, height: 15700 / 852 };

// Seal-local percent: one crack across the middle, the way brittle wax snaps — nearly straight with
// a slight tilt and small uneven kinks, plus two angular bumps (one up on the left, one down on the
// right) so it doesn't read as a ruled line from a distance. The upper half reaches just past it,
// so no seam shows while the seal is whole.
const CRACK_LINE = [
  [0, 50.9], [4, 50.7], [9, 50.8], [13.5, 50.4], [18, 50.5], [22, 50.1], [27, 49.3], [31.5, 47.9],
  [34, 48.4], [38, 50.2], [43, 50.1], [47.5, 50.2], [52, 49.7], [56, 49.9], [60.5, 49.5], [64, 49.7],
  [68, 50.8], [70.5, 51.6], [75, 50.4], [80, 49.6], [84.5, 49.5], [89, 49.1], [94, 49.3], [100, 49],
];
const upperHalf = (overlap) => [[0, 0], [100, 0], ...[...CRACK_LINE].reverse().map(([x, y]) => [x, y + overlap])];
const SEAL_HALVES = {
  upper: upperHalf(1.2),
  lower: [...CRACK_LINE, [100, 100], [0, 100]],
};

const toClip = (points) => `polygon(${points.map(([x, y]) => `${+x.toFixed(3)}% ${+y.toFixed(3)}%`).join(', ')})`;
function setClip(el, points) {
  el.style.clipPath = toClip(points);
  el.style.webkitClipPath = toClip(points);
}

function play(el, keyframes, options) {
  const animation = el.animate(keyframes, options);
  animation.playbackRate = 1 / slowmo;
  return animation;
}

// Cut a flap outline down to the strip between two cuts, overlapping neighbours by a hair so no seam shows.
const SEAM = 0.15;
function clipToStrip(polygon, axis, from, to) {
  const k = axis === 'x' ? 0 : 1;
  const lo = Math.min(from, to) - SEAM;
  const hi = Math.max(from, to) + SEAM;
  const clip = (points, inside, bound) => points.flatMap((p, i) => {
    const q = points[(i + 1) % points.length];
    const out = inside(p[k]) ? [p] : [];
    if (inside(p[k]) !== inside(q[k])) {
      const t = (bound - p[k]) / (q[k] - p[k]);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
    return out;
  });
  return clip(clip(polygon, (v) => v >= lo, lo), (v) => v <= hi, hi);
}

const OPPOSITE = { 'to bottom': 'to top', 'to top': 'to bottom', 'to right': 'to left', 'to left': 'to right' };

function photoImage(box) {
  const img = new Image();
  img.src = PAPER_SRC;
  img.alt = '';
  Object.assign(img.style, {
    width: `${10000 / box.width}%`,
    height: `${10000 / box.height}%`,
    left: `${(-box.left / box.width) * 100}%`,
    top: `${(-box.top / box.height) * 100}%`,
  });
  return img;
}

// shadeDir points from the hinge side of the strip toward its tip, as seen from the front.
function makeFace(points, axis, isBack, shadeDir) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const width = Math.max(...xs) - left;
  const height = Math.max(...ys) - top;

  const face = document.createElement('div');
  face.className = isBack ? 'face face--back' : 'face';
  Object.assign(face.style, { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` });

  let local = points.map(([x, y]) => [((x - left) / width) * 100, ((y - top) / height) * 100]);
  if (isBack) {
    // Turned 180° to face the other way, so the outline and shading run mirrored to land back on the strip.
    local = local.map(([u, v]) => (axis === 'y' ? [u, 100 - v] : [100 - u, v]));
    face.style.transform = axis === 'y' ? 'rotateX(180deg)' : 'rotateY(180deg)';
    face.style.setProperty('--shade-dir', OPPOSITE[shadeDir]);
  } else {
    face.style.setProperty('--shade-dir', shadeDir);
    face.append(photoImage({ left, top, width, height }));
  }
  setClip(face, local);
  return face;
}

function buildTopFlap(spec) {
  const flapEl = document.createElement('div');
  flapEl.className = 'flap flap--top';
  flapEl.style.transform = `translateZ(${spec.z}px)`;

  const bands = [];
  let parent = flapEl;
  for (let i = 0; i < spec.cuts.length - 1; i++) {
    const band = document.createElement('div');
    band.className = 'band';
    band.style.transformOrigin = `50% ${spec.cuts[i]}%`;
    const strip = clipToStrip(spec.polygon, spec.axis, spec.cuts[i], spec.cuts[i + 1]);
    const front = makeFace(strip, spec.axis, false, 'to bottom');
    const back = makeFace(strip, spec.axis, true, 'to bottom');
    band.append(front, back);
    parent.append(band);
    parent = band;
    bands.push({ el: band, front, back, shade: { front: [0, 0], back: [-1, -1] } });
  }
  envelopeStage.append(flapEl);

  const count = bands.length;
  return {
    ...spec,
    bands,
    phi: new Float64Array(count), // each strip's angle off the envelope, 0 (flat) … 180 (folded back)
    vel: new Float64Array(count),
    // Stiff near the crease, floppier toward the tip; the strip holding the wax is heavier.
    stiffness: bands.map((_, i) => 520 * 0.8 ** i),
    weight: bands.map((_, i) => (i === count - 1 ? spec.gravity * 1.6 : spec.gravity)),
  };
}

// Keep the part of a polygon where a·x + b·y ≥ c.
function clipHalfPlane(points, a, b, c) {
  const f = ([x, y]) => a * x + b * y - c;
  return points.flatMap((p, i) => {
    const q = points[(i + 1) % points.length];
    const out = f(p) >= 0 ? [p] : [];
    if ((f(p) >= 0) !== (f(q) >= 0)) {
      const t = f(p) / (f(p) - f(q));
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
    return out;
  });
}

// The pieces of a glued flap that lie below the top flap's V-shaped edge: one per side of the V.
function belowTopFlapEdge(polygon) {
  const { margin } = TOP_FLAP_EDGE;
  return [['left', (x) => 50 + SEAM - x], ['right', (x) => x - (50 - SEAM)]].map(([side]) => {
    const { from: [x0, y0], to: [x1, y1] } = TOP_FLAP_EDGE[side];
    const slope = (y1 - y0) / (x1 - x0);
    // y ≥ y0 + slope·(x − x0) + margin  →  −slope·x + y ≥ y0 − slope·x0 + margin
    const below = clipHalfPlane(polygon, -slope, 1, y0 - slope * x0 + margin);
    return side === 'left' ? clipHalfPlane(below, -1, 0, -(50 + SEAM)) : clipHalfPlane(below, 1, 0, 50 - SEAM);
  }).filter((piece) => piece.length >= 3);
}

function makeSealHalf(half, z) {
  const el = document.createElement('div');
  el.className = `seal-half seal-half--${half}`;
  Object.assign(el.style, {
    left: `${SEAL_BOX.left}%`, top: `${SEAL_BOX.top}%`, width: `${SEAL_BOX.width}%`, height: `${SEAL_BOX.height}%`,
    transform: `translateZ(${z}px)`,
  });
  const img = new Image();
  img.src = SEAL_SRC;
  img.alt = '';
  setClip(img, SEAL_HALVES[half]);
  el.append(img);
  return el;
}

// The glued body: the side and bottom flaps, with nothing behind them, so the invitation shows
// through the mouth once the flap lifts. It slides away as one piece.
const envelopeBody = document.createElement('div');
envelopeBody.className = 'envelope__body';
const gluedFlaps = Object.fromEntries(GLUED_FLAPS.map(({ name, z, polygon }) => {
  const flap = document.createElement('div');
  flap.className = `flap flap--${name}`;
  flap.style.transform = `translateZ(${z}px)`;
  belowTopFlapEdge(polygon).forEach((piece) => flap.append(makeFace(piece, 'y', false, 'to bottom')));
  envelopeBody.append(flap);
  return [name, flap];
}));
envelopeStage.append(envelopeBody);

const topFlap = buildTopFlap(TOP_FLAP);

// The seal lies over both flaps: the upper half rides the top flap's tip (and may stick out past
// its edge), the lower half stays on the bottom flap, lifted clear of the tip it overlaps.
const sealUpper = makeSealHalf('upper', 1.6);
const sealLower = makeSealHalf('lower', 2.7);
const crackPath = `M${CRACK_LINE.map(([x, y]) => `${x} ${y + 0.6}`).join(' L')}`;
sealUpper.insertAdjacentHTML('beforeend', `<svg class="seal-crack" viewBox="0 0 100 100" preserveAspectRatio="none">
  <path class="seal-crack__lip" d="${crackPath}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>
  <path class="seal-crack__core" d="${crackPath}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>
</svg>`);
setClip(sealUpper.querySelector('.seal-crack'), upperHalf(2.2));
topFlap.bands.at(-1).el.append(sealUpper);
gluedFlaps.bottom.append(sealLower);

// A few crumbs of wax fly off where it snaps.
function snapCrumbs(count) {
  const box = envelopeFx.getBoundingClientRect();
  const seal = sealLower.querySelector('img').getBoundingClientRect();
  for (let i = 0; i < count; i++) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    const size = 1.5 + Math.random() * 2;
    chip.style.width = `${size}px`;
    chip.style.height = `${size * (0.6 + Math.random() * 0.4)}px`;

    const along = 0.1 + Math.random() * 0.8;
    const x0 = seal.left - box.left + seal.width * along;
    const y0 = seal.top - box.top + seal.height * 0.505;
    const vx = (along - 0.5) * 160 + (Math.random() - 0.5) * 60;
    const vy = -(40 + Math.random() * 90);
    const spin = (Math.random() - 0.5) * 700;
    const duration = 450 + Math.random() * 250;

    const frames = Array.from({ length: 9 }, (_, step) => {
      const t = ((step / 8) * duration) / 1000;
      return {
        transform: `translate(${x0 + vx * t}px, ${y0 + vy * t + 900 * t * t}px) rotate(${spin * t}deg)`,
        opacity: step < 6 ? 1 : (8 - step) / 3,
      };
    });
    envelopeFx.append(chip);
    play(chip, frames, { duration, easing: 'linear', fill: 'forwards' }).finished.then(() => chip.remove());
  }
}

// Snap: the crack runs across in an instant and the halves part by a hair. Nothing else moves.
function snapSeal() {
  sealUpper.querySelectorAll('.seal-crack path').forEach((path) => {
    play(path, [{ strokeDashoffset: '1px' }, { strokeDashoffset: '0px' }], { duration: 55, easing: 'linear', fill: 'forwards' });
  });
  play(sealUpper, [
    { transform: 'translateZ(1.6px)' },
    { transform: 'translateZ(1.6px) translateY(-0.5px)' },
  ], { duration: 60, delay: 40, easing: 'ease-out', fill: 'forwards' });
  snapCrumbs(6);
}

// Paper physics: the strip at the crease is turned open; every other strip is pulled after its
// neighbour by a damped spring and sags under its own weight, so the sheet bends and settles.
const MAX_BEND = 38;
const easeOpen = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);

function stepFlap(flap, time, dt) {
  const { phi, vel, stiffness, weight } = flap;
  const progress = Math.min(Math.max((time - flap.delay) / flap.duration, 0), 1);
  const target = 180 * easeOpen(progress);
  vel[0] = (target - phi[0]) / dt;
  phi[0] = target;

  for (let i = 1; i < phi.length; i++) {
    const k = stiffness[i];
    const damping = 0.64 * Math.sqrt(k);
    const acceleration = k * (phi[i - 1] - phi[i]) - damping * (vel[i] - vel[i - 1]) - weight[i] * Math.cos(phi[i] * RAD);
    vel[i] += acceleration * dt;
    phi[i] += vel[i] * dt;

    const bend = phi[i] - phi[i - 1];
    if (Math.abs(bend) > MAX_BEND) {
      phi[i] = phi[i - 1] + Math.sign(bend) * MAX_BEND;
      vel[i] = vel[i - 1];
    }
    // The envelope underneath and the table beyond stop the paper from passing through them.
    if (phi[i] < 0) {
      phi[i] = 0;
      vel[i] = Math.max(0, -vel[i] * 0.2);
    } else if (phi[i] > 180) {
      phi[i] = 180;
      vel[i] = Math.min(0, -vel[i] * 0.2);
    }
  }
}

// Darkness at each strip's hinge-side and tip-side edges: the average with its neighbour there.
const edgeShades = (dark, i) => [
  (dark[Math.max(i - 1, 0)] + dark[i]) / 2,
  (dark[i] + dark[Math.min(i + 1, dark.length - 1)]) / 2,
];

function setShade(band, side, [from, to]) {
  const [lastFrom, lastTo] = band.shade[side];
  if (Math.abs(lastFrom - from) < 0.004 && Math.abs(lastTo - to) < 0.004) return;
  band.shade[side] = [from, to];
  band[side].style.setProperty('--shade-from', from.toFixed(3));
  band[side].style.setProperty('--shade-to', to.toFixed(3));
}

function renderFlap(flap) {
  const { phi, bands } = flap;
  // Paper darkens as it turns from the light; the inside brightens as it comes round.
  const frontDark = Array.from(phi, (angle) => 0.34 * (1 - Math.max(0, Math.cos(angle * RAD))));
  const backDark = Array.from(phi, (angle) => 0.26 * (1 - Math.max(0, -Math.cos(angle * RAD))));
  bands.forEach((band, i) => {
    const relative = phi[i] - (i ? phi[i - 1] : 0);
    band.el.style.transform = `rotateX(${(flap.sign * relative).toFixed(2)}deg)`;
    setShade(band, 'front', edgeShades(frontDark, i));
    setShade(band, 'back', edgeShades(backDark, i));
  });
}

// The flap has gone once every part of it, seal included, is above the top of the screen.
function topFlapGone() {
  const limit = envelope.getBoundingClientRect().top + 1;
  const above = (el) => el.getBoundingClientRect().bottom <= limit;
  return above(sealUpper) && topFlap.bands.every(({ front, back }) => above(front) && above(back));
}

// The glued body slides away down the screen, fading as it goes, letting the invitation in from above.
function slideBodyAway() {
  envelope.classList.add('is-sliding');
  play(envelopeBody, [
    { opacity: 1 },
    { opacity: 1, offset: 0.2 },
    { opacity: 0 },
  ], { duration: SLIDE_DURATION, easing: 'ease-in', fill: 'forwards' });
  play(envelope.querySelector('.envelope__shade'), [{ opacity: 0.45 }, { opacity: 0 }], {
    duration: SLIDE_DURATION, easing: 'ease-out', fill: 'forwards',
  });
  return play(envelopeBody, [{ transform: 'translateY(0)' }, { transform: 'translateY(104%)' }], {
    duration: SLIDE_DURATION, easing: 'cubic-bezier(0.55, 0, 0.35, 1)', fill: 'forwards',
  }).finished;
}

function finishEnvelope() {
  envelope.hidden = true;
  root.classList.remove('is-locked');
  window.scrollTo(0, 0);
  topbar.hidden = false;
  // With the envelope out of frame, the header slides down into place from above the screen.
  if (!reduceMotion) {
    play(topbar, [
      { transform: 'translate(-50%, -100%)' },
      { transform: 'translate(-50%, 0)' },
    ], { duration: 600, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  }
}

function openEnvelope() {
  envelope.classList.add('is-opening');

  if (reduceMotion) {
    envelope.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).finished.then(finishEnvelope);
    return;
  }

  play(envelope.querySelector('.envelope__hint'), [{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });

  // As the flap lifts, the names over the closed doors show through the mouth and brighten.
  play(envelope.querySelector('.envelope__shade'), [{ opacity: 1 }, { opacity: 0.45 }], {
    duration: 900, delay: T.lift, easing: 'ease-out', fill: 'forwards',
  });

  const SUBSTEPS = 4;
  const start = performance.now();
  let last = start;
  let snapped = false;

  function frame(now) {
    const time = (now - start) / slowmo;
    const dt = Math.min((now - last) / 1000 / slowmo, 1 / 30);
    last = now;
    if (!snapped && time >= T.snap) {
      snapped = true;
      snapSeal();
    }
    if (dt > 0) {
      for (let s = 0; s < SUBSTEPS; s++) {
        stepFlap(topFlap, time - (dt * 1000 * (SUBSTEPS - 1 - s)) / SUBSTEPS, dt / SUBSTEPS);
      }
      renderFlap(topFlap);
    }
    if (time > T.lift + 300 && (time >= SLIDE_LATEST || topFlapGone())) {
      slideBodyAway().then(finishEnvelope);
      return;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

envelope.querySelector('.envelope__open').addEventListener('click', openEnvelope, { once: true });

// Cover → welcome: how far the pinned screen has been scrolled drives the doors → alley clip frame by
// frame. The names fade out as it starts, "Dear guest" fades in once it has landed on the alley.
const journey = document.getElementById('cover');
const journeyStage = journey.querySelector('.journey__stage');
const journeyVideo = journey.querySelector('.journey__video');
const journeyLast = journey.querySelector('.journey__frame--last');
const journeyShade = journey.querySelector('.journey__shade');
const coverCard = journey.querySelector('.cover__card');
const coverHint = journey.querySelector('.scroll-hint');
const welcomeCard = journey.querySelector('.welcome__card');

// Scroll distances in svh, as in .journey's --motion and --freeze.
const JOURNEY_MOTION = 260;
const JOURNEY_FREEZE = 100;
const CLIP_FROM = 21; // scrolled before the doors start to move, as the names fade out
const CLIP_MOTION_END = 234; // where the camera has arrived at the alley
// Where the clip's own motion stops and its closing freeze frame begins (measured in the edit).
const CLIP_FREEZE_AT = 8.03;
const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const smoothstep = (from, to, x) => {
  const t = clamp01((x - from) / (to - from));
  return t * t * (3 - 2 * t);
};

// Scrubs a video to whatever time the page asks for: eases toward it and seeks one step at a time,
// since queueing seeks while the decoder is busy makes the scrub lag behind the finger.
function createScrubber(video, onReadyChange) {
  // The video may have loaded before this script ran, in which case 'loadeddata' has already fired.
  let ready = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
  let target = 0;
  let shown = 0;
  let running = false;

  function step() {
    const duration = video.duration;
    if (!ready || !duration) {
      running = false;
      return;
    }
    const goal = Math.min(target, duration - 0.05);
    const gap = goal - shown;
    shown = reduceMotion || Math.abs(gap) < 0.02 ? goal : shown + gap * 0.25;
    if (!video.seeking && Math.abs(video.currentTime - shown) > 0.5 / 30) video.currentTime = shown;
    if (shown !== goal || video.seeking) requestAnimationFrame(step);
    else running = false;
  }

  video.addEventListener('loadeddata', () => {
    ready = true;
    onReadyChange();
  });
  video.addEventListener('error', () => {
    ready = false;
    onReadyChange();
  });

  return {
    get ready() { return ready; },
    seek(seconds) {
      target = seconds;
      if (running) return;
      running = true;
      requestAnimationFrame(step);
    },
  };
}

let journeyQueued = false;
const journeyClip = createScrubber(journeyVideo, () => queueJourney());

function renderJourney() {
  journeyQueued = false;
  const track = journey.offsetHeight - journeyStage.offsetHeight;
  const scrolled = track > 0 ? clamp01(-journey.getBoundingClientRect().top / track) : 0;
  const at = scrolled * (JOURNEY_MOTION + JOURNEY_FREEZE); // svh scrolled into the track
  const motion = clamp01((at - CLIP_FROM) / (CLIP_MOTION_END - CLIP_FROM));
  const freeze = clamp01((at - CLIP_MOTION_END) / (JOURNEY_MOTION + JOURNEY_FREEZE - CLIP_MOTION_END));

  const namesOut = smoothstep(0, 26, at);
  coverCard.style.opacity = 1 - namesOut;
  coverCard.style.transform = `translateY(${(-24 * namesOut).toFixed(1)}px)`;
  coverHint.style.opacity = 1 - smoothstep(0, 13, at);
  // "Dear guest" arrives with the freeze frame and stays through it.
  const welcomeIn = smoothstep(CLIP_MOTION_END, CLIP_MOTION_END + 20, at);
  welcomeCard.style.opacity = welcomeIn;
  welcomeCard.style.transform = `translateY(${(16 * (1 - welcomeIn)).toFixed(1)}px)`;
  // The dimming lifts while the doors open and the camera travels, and returns under the text.
  journeyShade.style.opacity = 1 - 0.7 * Math.sin(Math.PI * motion);
  // If the clip can't be shown, cross-fade between its first and last frames instead.
  journeyLast.style.opacity = journeyClip.ready ? 0 : smoothstep(0.3, 0.7, motion);

  const duration = journeyVideo.duration || CLIP_FREEZE_AT;
  journeyClip.seek(motion < 1 ? motion * CLIP_FREEZE_AT : CLIP_FREEZE_AT + freeze * Math.max(duration - CLIP_FREEZE_AT, 0));
}

function queueJourney() {
  if (journeyQueued) return;
  journeyQueued = true;
  requestAnimationFrame(renderJourney);
}

window.addEventListener('scroll', queueJourney, { passive: true });
window.addEventListener('resize', queueJourney);
renderJourney();

// iOS only fetches and seeks a video after it has played from a user gesture: tapping the
// envelope is that gesture, so play and pause each scrubbed video at once, invisibly, on its first frame.
envelope.querySelector('.envelope__open').addEventListener('click', () => {
  startMusic();
  document.querySelectorAll('.journey__video, .program__veil').forEach((video) => {
    video.play().then(() => {
      video.pause();
      video.currentTime = 0;
    }, () => {});
  });
}, { once: true });

// Scratch card: wiping the heart away reveals the date, and once it is empty a party popper fires from below.
const date = document.getElementById('date');
const heart = date.querySelector('.date__heart');
const heartImg = heart.querySelector('img');
const scratch = heart.querySelector('.date__scratch');
const burst = date.querySelector('.date__burst');

// A wide brush and a 60% threshold keep it to a few swipes of the finger.
const SCRATCH_RADIUS = 30;
const REVEAL_AT = 0.6; // share of the heart wiped before the rest dissolves on its own
const FALLBACK_STROKE = 1000; // px of scratching that counts as "empty" when pixels can't be read

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
  unlockDate();
  dateWatcher.disconnect();
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
  // Without the heart there is nothing to scratch, so don't hold the screen hostage.
  heartImg.addEventListener('error', () => revealDate(), { once: true });
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

// The date screen holds still until the heart has been scratched, so nobody scrolls past the
// reveal or slides the screen away mid-scratch. Once revealed it stays revealed for the visit.
let dateLocked = false;

function lockDate() {
  if (revealed || dateLocked) return;
  dateLocked = true;
  date.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  // Let that scroll finish before freezing the page, or it would stop halfway.
  setTimeout(() => {
    if (dateLocked) root.classList.add('is-locked');
  }, reduceMotion ? 0 : 500);
}

function unlockDate() {
  dateLocked = false;
  root.classList.remove('is-locked');
}

const dateWatcher = new IntersectionObserver(([entry]) => {
  if (entry.isIntersecting) lockDate();
}, { threshold: 0.7 });
dateWatcher.observe(date);

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

// Program: while it is pinned, scrolling first parts the veil frame by frame, then brings the title
// and the four times in one after another; scrolling back up undoes both. The vine down the middle
// stays through all of it. Scroll distances in svh, as in .program-track's --veil and --reveal.
const PROGRAM_VEIL = 150;
const PROGRAM_REVEAL = 130;
const programTrack = document.getElementById('program');
const programStage = programTrack.querySelector('.program');
const veil = programTrack.querySelector('.program__veil');
if (reduceMotion) {
  veil.hidden = true;
} else {
  let veilQueued = false;
  const queueVeil = () => {
    if (veilQueued) return;
    veilQueued = true;
    requestAnimationFrame(renderVeil);
  };
  const veilClip = createScrubber(veil, queueVeil);
  // The title is there from the start, like the vine; only the times come in one by one.
  const programSteps = [...programStage.querySelectorAll('.program__item')];

  function renderVeil() {
    veilQueued = false;
    const stageHeight = programStage.offsetHeight;
    const pinnedTop = Math.min(0, window.innerHeight - stageHeight); // same as .program's sticky top
    const track = programTrack.offsetHeight - stageHeight;
    const scrolled = track > 0 ? clamp01((pinnedTop - programTrack.getBoundingClientRect().top) / track) : 1;
    const veilShare = PROGRAM_VEIL / (PROGRAM_VEIL + PROGRAM_REVEAL);
    const parted = clamp01(scrolled / veilShare);

    // With the veil gone, each line rises into place in turn over the rest of the track.
    const reveal = clamp01((scrolled - veilShare) / (1 - veilShare));
    programSteps.forEach((step, i) => {
      const shown = smoothstep(i * 0.16, i * 0.16 + 0.22, reveal);
      const lift = ((1 - shown) * 18).toFixed(1);
      step.style.opacity = shown.toFixed(3);
      step.style.transform = `translateY(${lift}px)`;
    });

    // Its last frames are black, i.e. see-through under screen blending, but not to the last digit:
    // fade the veil out over the tail so dropping it doesn't darken the screen in one step.
    veil.style.opacity = (1 - smoothstep(0.85, 1, parted)).toFixed(3);
    veil.style.visibility = parted >= 1 ? 'hidden' : '';
    veilClip.seek(parted * (veil.duration || 7));
  }

  // Fetch it as the programme approaches, so it is ready to scrub when it arrives.
  new IntersectionObserver(([entry], observer) => {
    if (!entry.isIntersecting) return;
    observer.disconnect();
    veil.preload = 'auto';
  }, { rootMargin: '100% 0px' }).observe(programTrack);

  window.addEventListener('scroll', queueVeil, { passive: true });
  window.addEventListener('resize', queueVeil);
  renderVeil();
}

// Text that rises into place the first time it is scrolled to.
const revealWatcher = new IntersectionObserver((entries, observer) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('is-in');
    observer.unobserve(entry.target);
  });
}, { threshold: 0.35 });
document.querySelectorAll('[data-reveal]').forEach((el) => revealWatcher.observe(el));

// Music: browsers only allow sound after a gesture, so it starts with the tap that opens the
// envelope and loops from there; the header button turns it off and on.
const music = document.querySelector('.music');
const sound = document.querySelector('.sound');
const MUSIC_VOLUME = 0.55;

function fadeMusic(to, ms) {
  const from = music.volume;
  const start = performance.now();
  return new Promise((done) => {
    requestAnimationFrame(function step(now) {
      const t = ms > 0 ? clamp01((now - start) / ms) : 1;
      music.volume = from + (to - from) * t;
      if (t < 1) requestAnimationFrame(step);
      else done();
    });
  });
}

function playMusic(fade) {
  return music.play().then(() => {
    sound.setAttribute('aria-pressed', 'true');
    return fadeMusic(MUSIC_VOLUME, fade);
  }, () => {
    sound.setAttribute('aria-pressed', 'false'); // refused (low power mode, say): show it as off
  });
}

function startMusic() {
  music.volume = 0;
  playMusic(1400);
}

sound.addEventListener('click', () => {
  if (music.paused) {
    music.volume = 0;
    playMusic(400);
  } else {
    sound.setAttribute('aria-pressed', 'false');
    fadeMusic(0, 300).then(() => music.pause());
  }
});

// RSVP: intentionally goes nowhere until the client's backend is connected.
document.querySelector('.rsvp__form').addEventListener('submit', (event) => {
  event.preventDefault();
});
