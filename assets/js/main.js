/* Vango Imedemaa — all site behaviour. No dependencies. */
(() => {
  'use strict';

  /* ---------------------------------------------------------- mobile nav */
  const toggle = document.querySelector('.site-nav__toggle');
  const menu = document.getElementById('site-menu');

  if (toggle && menu) {
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      menu.classList.toggle('is-open', open);
    };
    toggle.addEventListener('click', () => {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    // close after picking a section
    menu.addEventListener('click', (e) => {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  /* ------------------------------------------------------- sticky navbar */
  /* The sentinel is a 1px marker sitting immediately above the nav. Once it
     has scrolled off the top the bar is detached, and the paper backing and
     the small crest fade in behind it. Watching a marker rather than a
     scroll offset keeps this correct however tall the header renders. */
  const sentinel = document.querySelector('.stick-sentinel');
  if (sentinel) {
    new IntersectionObserver(
      ([entry]) => {
        document.body.classList.toggle(
          'is-stuck',
          !entry.isIntersecting && entry.boundingClientRect.top < 0
        );
      },
      { threshold: 0 }
    ).observe(sentinel);
  }

  /* -------------------------------------------------------- back to top */
  const toTop = document.querySelector('.to-top');
  if (toTop) {
    const io = new IntersectionObserver(
      ([entry]) => { toTop.hidden = entry.isIntersecting; },
      { rootMargin: '0px' }
    );
    const sentinel = document.querySelector('.site-header');
    if (sentinel) io.observe(sentinel); else toTop.hidden = false;

    toTop.addEventListener('click', () => {
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });
  }

  /* ------------------------------------------------------------ lightbox */
  const dialog = document.getElementById('lightbox');
  if (!dialog || typeof dialog.showModal !== 'function') return;

  const imgEl = dialog.querySelector('.lightbox__img');
  const capEl = dialog.querySelector('.lightbox__caption');
  const btnPrev = dialog.querySelector('.lightbox__btn--prev');
  const btnNext = dialog.querySelector('.lightbox__btn--next');
  const btnClose = dialog.querySelector('.lightbox__btn--close');

  /** Group name -> array of {href, caption} */
  const groups = new Map();
  document.querySelectorAll('a[data-lightbox]').forEach((a) => {
    const key = a.dataset.lightbox;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ href: a.href, caption: a.dataset.caption || '', trigger: a });
  });

  let items = [];
  let index = 0;
  let opener = null;
  let emptyTimer = null;

  const render = () => {
    const item = items[index];
    if (!item) return;
    imgEl.src = item.href;
    imgEl.alt = item.caption;
    capEl.textContent = items.length > 1
      ? `${item.caption} — ${index + 1}/${items.length}`
      : item.caption;
    dialog.toggleAttribute('data-single', items.length < 2);
    // warm the neighbours so paging feels instant
    [index + 1, index - 1].forEach((i) => {
      const n = items[(i + items.length) % items.length];
      if (n) new Image().src = n.href;
    });
  };

  const open = (key, startIndex, triggerEl) => {
    items = groups.get(key) || [];
    if (!items.length) return;
    clearTimeout(emptyTimer);
    index = Math.max(0, Math.min(startIndex, items.length - 1));
    opener = triggerEl;
    render();
    dialog.showModal();
  };

  const step = (delta) => {
    if (items.length < 2) return;
    index = (index + delta + items.length) % items.length;
    render();
  };

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-lightbox]');
    if (link) {
      e.preventDefault();
      const key = link.dataset.lightbox;
      const list = groups.get(key) || [];
      open(key, list.findIndex((i) => i.trigger === link), link);
      return;
    }
    const more = e.target.closest('[data-open-lightbox]');
    if (more) {
      e.preventDefault();
      open(more.dataset.openLightbox, 0, more);
    }
  });

  btnPrev.addEventListener('click', () => step(-1));
  btnNext.addEventListener('click', () => step(1));
  btnClose.addEventListener('click', () => dialog.close());

  // click the backdrop / padding to dismiss
  dialog.addEventListener('click', (e) => {
    if (!e.target.closest('.lightbox__img, .lightbox__btn')) dialog.close();
  });

  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); step(-1); }
  });

  dialog.addEventListener('close', () => {
    if (opener && document.contains(opener)) opener.focus();
    opener = null;
    // The dialog fades out rather than vanishing, so emptying it now would
    // blink the picture away and leave an empty frame fading. Wait for the
    // fade, and only then — unless it has been reopened in the meantime.
    clearTimeout(emptyTimer);
    emptyTimer = setTimeout(() => {
      if (!dialog.open) imgEl.removeAttribute('src');
    }, 350);
  });

  // swipe on touch
  let touchX = null;
  dialog.addEventListener('touchstart', (e) => { touchX = e.changedTouches[0].clientX; }, { passive: true });
  dialog.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
    touchX = null;
  }, { passive: true });
})();
