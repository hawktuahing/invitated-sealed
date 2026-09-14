const root = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Envelope: a plain fade for now. The flaps → card → doors → alley sequence replaces it later.
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
}, { once: true });

// Scratch card: a tap reveals the date for now; canvas scratching comes later.
const date = document.getElementById('date');
date.querySelector('.scratch__cover').addEventListener('click', () => {
  date.classList.add('is-revealed');
});

// Music toggle: tracks state only until a track is chosen.
const sound = document.querySelector('.sound');
sound.addEventListener('click', () => {
  sound.setAttribute('aria-pressed', String(sound.getAttribute('aria-pressed') !== 'true'));
});

// RSVP: no endpoint chosen yet.
document.querySelector('.rsvp__form').addEventListener('submit', (event) => {
  event.preventDefault();
});
