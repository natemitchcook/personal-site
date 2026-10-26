(() => {
  const word = document.getElementById('business-word');
  const button = document.querySelector('.cycle-toggle');
  if (!word || !button) return;
  const words = ['a restaurant.', 'a plumber.', 'a dry cleaner.', 'a caterer.', 'a cleaning service.', 'a business like yours.'];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = motion.matches, index = 0, timer;
  function sync() {
    clearInterval(timer);
    button.textContent = paused ? 'Play rotating examples' : 'Pause rotating examples';
    button.setAttribute('aria-pressed', String(paused));
    if (!paused && !document.hidden) timer = setInterval(() => { index = (index + 1) % words.length; word.textContent = words[index]; }, 3000);
  }
  button.addEventListener('click', () => { paused = !paused; sync(); });
  motion.addEventListener('change', () => { paused = motion.matches; sync(); });
  document.addEventListener('visibilitychange', sync);
  sync();
})();
