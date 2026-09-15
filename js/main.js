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

// Envelope: the wax seal cracks in stages, then the sealed top flap peels open as a bendable sheet
// of paper — like a real envelope, whose other flaps are glued shut — and the envelope gives way
// to the invitation. Add ?slowmo=4 to the URL to watch it slowly.
const envelope = document.getElementById('envelope');
const cover = document.getElementById('cover');
const envelopeStage = envelope.querySelector('.envelope__stage');
const envelopeFx = envelope.querySelector('.envelope__fx');

const PAPER_SRC = 'assets/img/envelope-paper.jpg';
const SEAL_SRC = 'assets/img/envelope-seal.png';
const RAD = Math.PI / 180;
const slowmo = Math.max(1, Number(new URLSearchParams(location.search).get('slowmo')) || 1);

// Milliseconds after the tap.
const T = {
  crack: 160, // cracks run out from the flap's tip along its edges
  branch: 430, // side cracks split off
  hairline: 520, // fine crazing that never splits
  strain: 680, // the wax trembles and the cracks widen
  chips: 760, // crumbs pop off
  split: 900, // it gives way
  top: 980, // the sealed flap lifts
  fade: 2150, // the envelope gives way to the invitation
};
const ENVELOPE_FADE = 800;

// Crease lines measured off the photo, in percent of its 479.5×852 box. The side and bottom flaps
// are glued into the pocket, so they stay put as single flat pieces. The top flap is cut into
// strips from the hinge to the tip; its last strip carries the wax, so it stays rigid.
const FLAP_SPECS = [
  {
    name: 'left', axis: 'x', sign: -1, z: 0, glued: true,
    polygon: [[0, 28.9], [36.6, 46.48], [0, 65.3]],
    cuts: [0, 36.6],
  },
  {
    name: 'right', axis: 'x', sign: 1, z: 0, glued: true,
    polygon: [[100, 28.7], [64, 46.83], [100, 65.9]],
    cuts: [100, 64],
  },
  {
    name: 'bottom', axis: 'y', sign: -1, z: 1.5, glued: true,
    polygon: [[0, 64.79], [50, 39.3], [100, 65.38], [100, 100], [0, 100]],
    cuts: [100, 39.3],
  },
  {
    name: 'top', axis: 'y', sign: 1, z: 3, delay: T.top, duration: 1400, gravity: 900,
    polygon: [[0, 0], [100, 0], [100, 29.18], [50, 53.64], [0, 29.4]],
    cuts: [0, 10, 19, 27, 34, 40.5, 53.64],
  },
];

// The 157px seal sits dead centre on the photo.
const SEAL_BOX = { left: 50 - 7850 / 479.5, top: 50 - 7850 / 852, width: 15700 / 479.5, height: 15700 / 852 };

// Seal-local percent. The wax breaks where it has to: along the V of the top flap's tip
// (which crosses the seal from about 27% at the sides down to 70% in the middle), so the
// top pieces leave with that flap and the lower wings stay on the bottom one.
const SEAL_PIECES = {
  topLeft: [[0, 0], [51, 0], [48, 18], [52, 33], [47, 45], [51, 57], [43, 62], [37, 58], [30, 50], [22, 45], [14, 38], [7, 33], [0, 27]],
  topRight: [[51, 0], [100, 0], [100, 27], [93, 33], [86, 40], [79, 46], [71, 51], [64, 58], [57, 63], [51, 57], [47, 45], [52, 33], [48, 18]],
  bottomLeft: [[0, 27], [7, 33], [14, 38], [22, 45], [30, 50], [37, 58], [43, 62], [50, 70], [47, 82], [52, 91], [49, 100], [0, 100]],
  bottomRight: [[50, 70], [57, 63], [64, 58], [71, 51], [79, 46], [86, 40], [93, 33], [100, 27], [100, 100], [49, 100], [52, 91], [47, 82]],
  shard: [[43, 62], [51, 57], [57, 63], [50, 70]],
};
const SEAL_NUDGE = {
  topLeft: 'translate(-0.8px, -1px) rotate(-1deg)',
  topRight: 'translate(0.9px, -0.8px) rotate(1.2deg)',
  bottomLeft: 'translate(-0.7px, 1px) rotate(0.8deg)',
  bottomRight: 'translate(0.8px, 1.1px) rotate(-1deg)',
};
const CRACKS = {
  crack: [
    'M50 70 L43 62 L37 58 L30 50 L22 45 L14 38 L7 33 L0 27',
    'M50 70 L57 63 L64 58 L71 51 L79 46 L86 40 L93 33 L100 27',
  ],
  branch: ['M43 62 L51 57 L57 63', 'M51 57 L47 45 L52 33 L48 18 L51 0', 'M50 70 L47 82 L52 91 L49 100'],
  hairline: ['M30 50 L33 40 L29 31', 'M79 46 L76 57 L80 66', 'M52 33 L60 29 L66 31'],
};
const CRACK_DRAW = { crack: 300, branch: 240, hairline: 200 };

const toClip = (points) => `polygon(${points.map(([x, y]) => `${+x.toFixed(3)}% ${+y.toFixed(3)}%`).join(', ')})`;
function setClip(el, points) {
  el.style.clipPath = toClip(points);
  el.style.webkitClipPath = toClip(points);
}
const centroid = (points) => points.reduce(([sx, sy], [x, y]) => [sx + x / points.length, sy + y / points.length], [0, 0]);

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

function buildFlap(spec) {
  const flapEl = document.createElement('div');
  flapEl.className = `flap flap--${spec.name}`;
  flapEl.style.transform = `translateZ(${spec.z}px)`;

  const ascending = spec.cuts.at(-1) > spec.cuts[0];
  const shadeDir = spec.axis === 'y' ? (ascending ? 'to bottom' : 'to top') : (ascending ? 'to right' : 'to left');

  const bands = [];
  let parent = flapEl;
  for (let i = 0; i < spec.cuts.length - 1; i++) {
    const band = document.createElement('div');
    band.className = 'band';
    band.style.transformOrigin = spec.axis === 'y' ? `50% ${spec.cuts[i]}%` : `${spec.cuts[i]}% 50%`;
    const strip = clipToStrip(spec.polygon, spec.axis, spec.cuts[i], spec.cuts[i + 1]);
    const front = makeFace(strip, spec.axis, false, shadeDir);
    const back = makeFace(strip, spec.axis, true, shadeDir);
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
    weight: bands.map((_, i) => (i === count - 1 && spec.axis === 'y' ? spec.gravity * 1.6 : spec.gravity)),
  };
}

function makeSealPiece(name, z) {
  const piece = document.createElement('div');
  piece.className = 'seal-piece';
  Object.assign(piece.style, {
    left: `${SEAL_BOX.left}%`, top: `${SEAL_BOX.top}%`, width: `${SEAL_BOX.width}%`, height: `${SEAL_BOX.height}%`,
    transform: `translateZ(${z}px)`,
  });
  const img = new Image();
  img.src = SEAL_SRC;
  img.alt = '';
  setClip(img, SEAL_PIECES[name]);
  const [cx, cy] = centroid(SEAL_PIECES[name]);
  img.style.transformOrigin = `${cx}% ${cy}%`;
  piece.append(img);
  return { name, piece, img };
}

// The inside of the envelope, seen through its mouth once the sealed flap lifts.
const envelopeInside = document.createElement('div');
envelopeInside.className = 'envelope__inside';
envelopeStage.append(envelopeInside);

const flaps = FLAP_SPECS.map(buildFlap);
const movingFlaps = flaps.filter((flap) => !flap.glued);
const flapByName = Object.fromEntries(flaps.map((flap) => [flap.name, flap]));
const topTip = flapByName.top.bands.at(-1).el;
const bottomTip = flapByName.bottom.bands.at(-1).el;

// The seal: whole with its (not yet drawn) cracks on the top flap's tip, pieces waiting underneath.
const sealWhole = document.createElement('div');
sealWhole.className = 'seal-whole';
Object.assign(sealWhole.style, {
  left: `${SEAL_BOX.left}%`, top: `${SEAL_BOX.top}%`, width: `${SEAL_BOX.width}%`, height: `${SEAL_BOX.height}%`,
  transform: 'translateZ(1.6px)',
});
sealWhole.innerHTML = `<img src="${SEAL_SRC}" alt="">
  <svg class="seal-cracks" viewBox="0 0 100 100" preserveAspectRatio="none">
    ${['glint', 'core'].map((layer) => Object.entries(CRACKS).map(([stage, paths]) => paths.map((d, index) => (
      `<path class="crack__${layer}" data-stage="${stage}" data-index="${index}" d="${d}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>`
    )).join('')).join('')).join('')}
  </svg>`;
topTip.append(sealWhole);

const sealPieces = [
  makeSealPiece('topLeft', 1.2),
  makeSealPiece('topRight', 1.2),
  makeSealPiece('bottomLeft', 2.8),
  makeSealPiece('bottomRight', 2.8),
];
sealPieces.forEach(({ name, piece }) => (name.startsWith('top') ? topTip : bottomTip).append(piece));

function crackSeal() {
  const img = sealWhole.querySelector('img');
  // Pressed in, held, then trembling under the strain just before it gives.
  const z = 'translateZ(1.6px)';
  const end = T.split;
  play(sealWhole, [
    { transform: `${z} scale(1)` },
    { transform: `${z} scale(0.965)`, offset: T.crack / end },
    { transform: `${z} scale(0.975)`, offset: 0.3 },
    { transform: `${z} scale(0.98)`, offset: T.strain / end },
    { transform: `${z} translate(0.5px, -0.3px) rotate(0.6deg) scale(0.98)`, offset: 0.8 },
    { transform: `${z} translate(-0.6px, 0.2px) rotate(-0.5deg) scale(0.985)`, offset: 0.85 },
    { transform: `${z} translate(0.4px, 0.4px) rotate(0.4deg) scale(0.985)`, offset: 0.9 },
    { transform: `${z} translate(-0.3px, -0.4px) rotate(-0.3deg) scale(0.99)`, offset: 0.95 },
    { transform: `${z} scale(1)` },
  ], { duration: end, easing: 'ease-out', fill: 'forwards' });
  play(img, [{ filter: 'brightness(1)' }, { filter: 'brightness(0.92)' }], {
    duration: 400, delay: T.strain, easing: 'ease-in', fill: 'forwards',
  });

  sealWhole.querySelectorAll('path').forEach((path) => {
    const { stage, index } = path.dataset;
    play(path, [{ strokeDashoffset: '1px' }, { strokeDashoffset: '0px' }], {
      duration: CRACK_DRAW[stage], delay: T[stage] + index * 70, easing: 'cubic-bezier(0.2, 0.6, 0.3, 1)', fill: 'forwards',
    });
    if (stage === 'hairline') return;
    const [from, to] = path.classList.contains('crack__core') ? ['0.9px', '2.1px'] : ['0.6px', '0.9px'];
    play(path, [{ strokeWidth: from }, { strokeWidth: to }], {
      duration: T.split - T.strain, delay: T.strain, easing: 'ease-in', fill: 'forwards',
    });
  });
}

function sealRectInFx() {
  const box = envelopeFx.getBoundingClientRect();
  const rect = sealWhole.querySelector('img').getBoundingClientRect();
  return { left: rect.left - box.left, top: rect.top - box.top, width: rect.width, height: rect.height };
}

// Crumbs of wax (and the odd flake of gilding) popping off along the V-shaped crack.
function scatterChips(count) {
  const seal = sealRectInFx();
  for (let i = 0; i < count; i++) {
    const chip = document.createElement('span');
    chip.className = `chip chip--${Math.random() < 0.3 ? 'gold' : 'wax'}`;
    const size = 2 + Math.random() * 4.5;
    chip.style.width = `${size}px`;
    chip.style.height = `${size * (0.6 + Math.random() * 0.5)}px`;

    const along = 0.08 + Math.random() * 0.84;
    const crackY = 0.27 + 0.43 * (1 - Math.abs(along - 0.5) * 2);
    const x0 = seal.left + seal.width * along;
    const y0 = seal.top + seal.height * (crackY + (Math.random() - 0.5) * 0.05);
    const vx = (along - 0.5) * 420 + (Math.random() - 0.5) * 120;
    const vy = -(160 + Math.random() * 220);
    const spin = (Math.random() - 0.5) * 900;
    const duration = 650 + Math.random() * 350;

    const frames = Array.from({ length: 9 }, (_, step) => {
      const t = ((step / 8) * duration) / 1000;
      return {
        transform: `translate(${x0 + vx * t}px, ${y0 + vy * t + 700 * t * t}px) rotate(${spin * t}deg)`,
        opacity: step < 6 ? 1 : (8 - step) / 3,
      };
    });
    envelopeFx.append(chip);
    play(chip, frames, { duration, easing: 'linear', fill: 'forwards' }).finished.then(() => chip.remove());
  }
}

// The seal gives way: the whole fades into its pieces, which shift apart, and the middle shard drops.
function splitSeal() {
  const seal = sealRectInFx();
  envelope.classList.add('is-split');
  play(sealWhole, [{ opacity: 1 }, { opacity: 0 }], { duration: 90, fill: 'forwards' });
  sealPieces.forEach(({ name, img }) => {
    play(img, [{ transform: 'none' }, { transform: SEAL_NUDGE[name] }], {
      duration: 220, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)', fill: 'forwards',
    });
  });

  const shard = document.createElement('div');
  shard.className = 'shard';
  Object.assign(shard.style, {
    left: `${seal.left}px`, top: `${seal.top}px`, width: `${seal.width}px`, height: `${seal.height}px`,
  });
  const img = new Image();
  img.src = SEAL_SRC;
  img.alt = '';
  setClip(img, SEAL_PIECES.shard);
  const [cx, cy] = centroid(SEAL_PIECES.shard);
  img.style.transformOrigin = `${cx}% ${cy}%`;
  shard.append(img);
  envelopeFx.append(shard);
  const fall = Array.from({ length: 9 }, (_, step) => {
    const t = step / 8;
    return {
      transform: `translate(${14 * t}px, ${-10 * t + 300 * t * t}px) rotate(${95 * t}deg) scale(${1 - 0.1 * t})`,
      opacity: step < 6 ? 1 : (8 - step) / 3,
    };
  });
  play(img, fall, { duration: 800, easing: 'linear', fill: 'forwards' });

  // Released from the wax, the top flap's tip springs up a little before it opens.
  const top = flapByName.top;
  top.vel[top.vel.length - 1] += 70;
  top.vel[top.vel.length - 2] += 30;
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
  const rotate = flap.axis === 'y' ? 'rotateX' : 'rotateY';
  const { phi, bands } = flap;
  // Paper darkens as it turns from the light; the inside brightens as it comes round.
  const frontDark = Array.from(phi, (angle) => 0.34 * (1 - Math.max(0, Math.cos(angle * RAD))));
  const backDark = Array.from(phi, (angle) => 0.26 * (1 - Math.max(0, -Math.cos(angle * RAD))));
  bands.forEach((band, i) => {
    const relative = phi[i] - (i ? phi[i - 1] : 0);
    band.el.style.transform = `${rotate}(${(flap.sign * relative).toFixed(2)}deg)`;
    setShade(band, 'front', edgeShades(frontDark, i));
    setShade(band, 'back', edgeShades(backDark, i));
  });
}

function finishEnvelope() {
  envelope.hidden = true;
  root.classList.remove('is-locked');
  window.scrollTo(0, 0);
  topbar.hidden = false;
  if (!reduceMotion) topbar.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: 'ease' });
}

function openEnvelope() {
  envelope.classList.add('is-opening');

  if (reduceMotion) {
    envelope.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).finished.then(finishEnvelope);
    return;
  }

  play(envelope.querySelector('.envelope__hint'), [{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
  crackSeal();
  // With the flap open, the envelope dissolves into the cover, which settles in underneath.
  play(envelope, [{ opacity: 1 }, { opacity: 0 }], {
    duration: ENVELOPE_FADE, delay: T.fade, easing: 'ease-in-out', fill: 'forwards',
  });
  play(cover.querySelector('.cover__card'), [
    { transform: 'translateY(16px) scale(0.94)', opacity: 0.5 },
    { transform: 'none', opacity: 1 },
  ], { duration: 1500, delay: T.fade - 100, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: 'backwards' });
  play(cover.querySelector('.cover__bg'), [{ scale: '1.08' }, { scale: '1' }], {
    duration: 2200, delay: T.fade - 300, easing: 'cubic-bezier(0.2, 0.6, 0.2, 1)', fill: 'backwards',
  });

  const events = [
    { at: T.chips, run: () => scatterChips(14) },
    { at: T.split, run: splitSeal },
  ];
  const end = T.fade + ENVELOPE_FADE;
  const SUBSTEPS = 4;
  const start = performance.now();
  let last = start;

  function frame(now) {
    const time = (now - start) / slowmo;
    const dt = Math.min((now - last) / 1000 / slowmo, 1 / 30);
    last = now;
    while (events.length && time >= events[0].at) events.shift().run();
    if (dt > 0) {
      for (let s = 0; s < SUBSTEPS; s++) {
        const subTime = time - (dt * 1000 * (SUBSTEPS - 1 - s)) / SUBSTEPS;
        movingFlaps.forEach((flap) => stepFlap(flap, subTime, dt / SUBSTEPS));
      }
      movingFlaps.forEach(renderFlap);
    }
    if (time < end) requestAnimationFrame(frame);
    else finishEnvelope();
  }
  requestAnimationFrame(frame);
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
