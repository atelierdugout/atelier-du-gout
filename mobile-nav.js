(() => {
  const top = document.querySelector('.top');
  const topin = top?.querySelector('.topin');
  if (!top || !topin || topin.querySelector('.mobile-menu-btn')) return;

  const btn = document.createElement('button');
  btn.className = 'mobile-menu-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Ouvrir le menu');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<span></span><span></span><span></span>';

  const menu = document.createElement('nav');
  menu.className = 'mobile-menu';
  menu.setAttribute('aria-label', 'Navigation mobile');

  menu.innerHTML = `
    <a href="/manger.html">À manger</a>
    <a href="/minargent.html">Minargent</a>
    <a href="/boissons.html">Boissons & cave</a>
    <a href="/epicerie.html">Épicerie fine</a>
    <a href="/coffrets.html">Coffrets</a>
    <a href="/cadeaux.html">Cartes cadeaux</a>
    <a href="/reservation.html">Réserver une table</a>
    <a href="/compte.html">Mon compte</a>
  `;

  topin.appendChild(btn);
  top.appendChild(menu);

  const close = () => {
    menu.classList.remove('open');
    btn.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Ouvrir le menu');
  };

  btn.addEventListener('click', () => {
    const open = !menu.classList.contains('open');
    menu.classList.toggle('open', open);
    btn.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
  });

  menu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', close);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') close();
  });
})();
