const root = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

// Scratch card: a tap reveals the date for now; canvas scratching comes later.
const date = document.getElementById('date');
date.querySelector('.date__heart').addEventListener('click', () => {
  date.classList.add('is-revealed');
});

// Music toggle: tracks state only until a track is chosen.
const sound = document.querySelector('.sound');
sound.addEventListener('click', () => {
  sound.setAttribute('aria-pressed', String(sound.getAttribute('aria-pressed') !== 'true'));
});

// RSVP: intentionally goes nowhere until the client's backend is connected.
document.querySelector('.rsvp__form').addEventListener('submit', (event) => {
  event.preventDefault();
});
