// A drop-down drawn in the game's own style, over a real <select>. The <select> stays in the page (hidden from sight and from the keyboard order): it keeps the
// value, the options and the "change" event, so the code that reads and listens to it does not change. The button and the list are the visible face:
// keyboard (Enter / Space / arrows / Home / End / letters / Esc), screen readers (combobox + listbox roles) and the mouse all work.

let openList: { close: () => void } | null = null;

/** Closes the drop-down list that is open, if any (so Esc closes that first, not the window around it). True when one was open. */
export function closeOpenSelect(): boolean {
  if (!openList) return false;
  openList.close();
  return true;
}

/** Draws `sel` as a styled drop-down. Returns a function that redraws the face after the code set `sel.value`. */
export function skinSelect(sel: HTMLSelectElement): () => void {
  const wrap = document.createElement('div');
  wrap.className = `kf-select ${[...sel.classList].join(' ')}`;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'kf-select-btn';
  btn.setAttribute('role', 'combobox');
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  const labelledBy = sel.id ? document.querySelector(`label[for="${sel.id}"]`) : null;
  if (sel.getAttribute('aria-label')) btn.setAttribute('aria-label', sel.getAttribute('aria-label')!);
  else if (!labelledBy && sel.closest('label')) btn.setAttribute('aria-label', [...sel.closest('label')!.childNodes].find((n) => n.nodeType === 3 && n.textContent?.trim())?.textContent?.trim() ?? '');
  else if (labelledBy) { labelledBy.id ||= `${sel.id}-label`; btn.setAttribute('aria-labelledby', labelledBy.id); }
  const text = document.createElement('span');
  text.className = 'kf-select-text';
  btn.append(text);
  sel.parentElement!.insertBefore(wrap, sel);
  wrap.append(btn, sel);
  sel.classList.add('kf-select-native');
  sel.tabIndex = -1;
  sel.setAttribute('aria-hidden', 'true');
  // (a <label for> now lands on the button)
  if (sel.id) { btn.id = `${sel.id}-btn`; labelledBy?.setAttribute('for', btn.id); }

  let list: HTMLUListElement | null = null;
  let active = -1;
  let typed = '', typedAt = 0;
  const options = () => [...sel.options];
  const face = () => { const o = sel.options[sel.selectedIndex]; text.textContent = o?.textContent ?? ''; if (o?.lang) text.lang = o.lang; else text.removeAttribute('lang'); };
  face();

  const mark = (i: number) => {
    active = Math.max(0, Math.min(options().length - 1, i));
    list?.querySelectorAll<HTMLElement>('li').forEach((li, n) => li.classList.toggle('active', n === active));
    const li = list?.children[active] as HTMLElement | undefined;
    if (li) { li.scrollIntoView({ block: 'nearest' }); btn.setAttribute('aria-activedescendant', li.id); }
  };
  const choose = (i: number) => {
    close();
    if (i === sel.selectedIndex) return;
    sel.selectedIndex = i;
    face();
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  };
  function close(): void {
    if (!list) return;
    list.remove(); list = null;
    btn.setAttribute('aria-expanded', 'false'); btn.removeAttribute('aria-activedescendant');
    document.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('resize', close);
    if (openList === handle) openList = null;
  }
  function outside(e: Event): void { if (list && !list.contains(e.target as Node) && !btn.contains(e.target as Node)) close(); }
  const handle = { close };

  function open(): void {
    if (list || sel.disabled) return;
    closeOpenSelect();
    list = document.createElement('ul');
    list.className = 'kf-select-list';
    list.setAttribute('role', 'listbox');
    list.id = `${sel.id || 'kf'}-list`;
    options().forEach((o, n) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.id = `${list!.id}-${n}`;
      li.textContent = o.textContent;
      if (o.lang) li.lang = o.lang;
      li.setAttribute('aria-selected', String(n === sel.selectedIndex));
      li.addEventListener('pointerdown', (e) => e.preventDefault()); // (the button keeps the focus)
      li.addEventListener('click', () => choose(n));
      li.addEventListener('pointermove', () => { if (active !== n) mark(n); });
      list!.append(li);
    });
    document.body.append(list);
    // under the button, as wide as it; above it when there is no room below
    const r = btn.getBoundingClientRect();
    const h = Math.min(list.scrollHeight, window.innerHeight * 0.5);
    list.style.minWidth = `${r.width}px`;
    list.style.left = `${Math.max(4, Math.min(window.innerWidth - list.offsetWidth - 4, r.left))}px`;
    const below = window.innerHeight - r.bottom - 8;
    list.style.maxHeight = `${Math.max(120, Math.min(h, below > 140 ? below : r.top - 8))}px`;
    list.style.top = below > 140 || below >= list.offsetHeight ? `${r.bottom + 4}px` : `${Math.max(4, r.top - list.offsetHeight - 4)}px`;
    btn.setAttribute('aria-expanded', 'true');
    mark(sel.selectedIndex);
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', close);
    openList = handle;
  }

  btn.addEventListener('click', () => (list ? close() : open()));
  btn.addEventListener('keydown', (e) => {
    const n = options().length;
    const move = (to: number) => { e.preventDefault(); if (!list) open(); mark(to); };
    if (e.key === 'ArrowDown') move(list ? active + 1 : sel.selectedIndex);
    else if (e.key === 'ArrowUp') move(list ? active - 1 : sel.selectedIndex);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(n - 1);
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (list) choose(active); else open(); }
    else if (e.key === 'Escape' && list) { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') close();
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { // typing a letter jumps to the next option that starts with it
      const now = Date.now(); typed = now - typedAt > 700 ? e.key.toLowerCase() : typed + e.key.toLowerCase(); typedAt = now;
      const from = typed.length === 1 ? (list ? active : sel.selectedIndex) + 1 : (list ? active : sel.selectedIndex);
      const found = [...options().slice(from), ...options().slice(0, from)].findIndex((o) => (o.textContent ?? '').trim().toLowerCase().startsWith(typed));
      if (found >= 0) { const to = (from + found) % n; if (list) mark(to); else choose(to); }
    }
  });
  btn.addEventListener('blur', () => { if (list) window.setTimeout(() => { if (document.activeElement !== btn) close(); }, 0); });
  new MutationObserver(() => { btn.disabled = sel.disabled; wrap.classList.toggle('disabled', sel.disabled); }).observe(sel, { attributes: true, attributeFilter: ['disabled'] });
  return face;
}
