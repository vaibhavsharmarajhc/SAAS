/**
 * Searchable Select
 * Upgrades a native <select> into a type-to-search dropdown without changing how the rest of the
 * app uses it: the original <select> stays in the DOM (hidden), keeps its value, fires its normal
 * 'change' event, and can still be repopulated (innerHTML) or set programmatically (.value / .selectedIndex).
 */

let stylesInjected = false;

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .ss-wrap { position: relative; min-width: 0; }
    .ss-wrap > select.ss-native { position: absolute; opacity: 0; pointer-events: none; width: 1px; height: 1px; left: 0; bottom: 0; }
    .ss-input { width: 100%; padding-right: 2rem; text-overflow: ellipsis; cursor: text;
      background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
      background-repeat: no-repeat; background-position: right 0.75rem center; }
    .ss-list { position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 10060; max-height: 260px; overflow-y: auto;
      background: var(--bg-sidebar); border: 1px solid var(--border-hover); border-radius: var(--radius-md, 8px);
      box-shadow: 0 10px 30px rgba(0,0,0,0.35); padding: 4px; display: none; min-width: 180px; }
    .ss-wrap.ss-open .ss-list { display: block; }
    .ss-item { padding: 0.45rem 0.65rem; border-radius: 6px; font-size: 0.85rem; color: var(--text-primary); cursor: pointer; line-height: 1.3; }
    .ss-item.ss-active { background: var(--color-primary-glow, rgba(217,119,6,0.2)); }
    .ss-item.ss-selected { font-weight: 700; color: var(--color-primary); }
    .ss-empty { padding: 0.6rem 0.75rem; font-size: 0.8rem; color: var(--text-muted); }
  `;
  document.head.appendChild(style);
}

export function enhanceSelect(select) {
  if (!select || select.dataset.ssEnhanced === 'true') return;
  injectStyles();
  select.dataset.ssEnhanced = 'true';

  const wrap = document.createElement('div');
  wrap.className = 'ss-wrap';
  // Carry over layout hints from the original select so it sits the same in flex rows / forms
  if (select.style.flex) wrap.style.flex = select.style.flex;
  if (select.style.width) wrap.style.width = select.style.width;

  select.parentNode.insertBefore(wrap, select);
  wrap.appendChild(select);
  select.classList.add('ss-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = (select.className.replace('ss-native', '').trim() || 'form-control') + ' ss-input';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('role', 'combobox');
  wrap.appendChild(input);

  const list = document.createElement('div');
  list.className = 'ss-list';
  list.setAttribute('role', 'listbox');
  wrap.appendChild(list);

  let activeIndex = -1;
  let visibleOptions = [];

  const isPlaceholder = (opt) => opt.value === '' && opt.disabled;

  function syncDisplay() {
    const opt = select.options[select.selectedIndex];
    const first = select.options[0];
    input.placeholder = first && isPlaceholder(first) ? first.text.replace(/^[-\s]+|[-\s]+$/g, '') : 'Search...';
    input.value = opt && !isPlaceholder(opt) ? opt.text : '';
    input.disabled = select.disabled;
  }

  function renderList(filterText = '') {
    const q = filterText.trim().toLowerCase();
    visibleOptions = Array.from(select.options).filter(o => !isPlaceholder(o) && (!q || o.text.toLowerCase().includes(q)));
    list.innerHTML = '';
    if (visibleOptions.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ss-empty';
      empty.textContent = 'No matches found';
      list.appendChild(empty);
      activeIndex = -1;
      return;
    }
    const selectedOpt = select.options[select.selectedIndex];
    visibleOptions.forEach((o, i) => {
      const item = document.createElement('div');
      item.className = 'ss-item' + (o === selectedOpt ? ' ss-selected' : '');
      item.setAttribute('role', 'option');
      item.textContent = o.text;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault(); // keep focus so blur doesn't close before we select
        choose(o);
      });
      item.addEventListener('mousemove', () => setActive(i, false));
      list.appendChild(item);
    });
    const selIdx = visibleOptions.indexOf(selectedOpt);
    setActive(!q && selIdx >= 0 ? selIdx : 0, true);
  }

  function setActive(i, scroll) {
    const items = list.querySelectorAll('.ss-item');
    items.forEach(el => el.classList.remove('ss-active'));
    activeIndex = i;
    const el = items[i];
    if (el) {
      el.classList.add('ss-active');
      if (scroll) el.scrollIntoView({ block: 'nearest' });
    }
  }

  function open() {
    if (select.disabled) return;
    wrap.classList.add('ss-open');
    renderList('');
  }

  function close() {
    wrap.classList.remove('ss-open');
    syncDisplay();
  }

  function choose(opt) {
    select.value = opt.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    wrap.classList.remove('ss-open');
    syncDisplay();
    input.blur();
  }

  input.addEventListener('focus', () => { open(); input.select(); });
  input.addEventListener('click', () => { if (!wrap.classList.contains('ss-open')) open(); });
  input.addEventListener('input', () => {
    wrap.classList.add('ss-open');
    renderList(input.value);
  });
  input.addEventListener('blur', close);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!wrap.classList.contains('ss-open')) open();
      else if (visibleOptions.length) setActive((activeIndex + 1) % visibleOptions.length, true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (visibleOptions.length) setActive((activeIndex - 1 + visibleOptions.length) % visibleOptions.length, true);
    } else if (e.key === 'Enter') {
      if (wrap.classList.contains('ss-open') && visibleOptions[activeIndex]) {
        e.preventDefault(); // don't submit the surrounding form while picking
        choose(visibleOptions[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      close();
      input.blur();
    }
  });

  // Keep the visible box in sync when code repopulates options or sets the value programmatically
  new MutationObserver(() => {
    syncDisplay();
    if (wrap.classList.contains('ss-open')) renderList(input.value === (select.options[select.selectedIndex] || {}).text ? '' : input.value);
  }).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });

  const valueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  Object.defineProperty(select, 'value', {
    configurable: true,
    get() { return valueDesc.get.call(this); },
    set(v) { valueDesc.set.call(this, v); syncDisplay(); }
  });
  const idxDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
  Object.defineProperty(select, 'selectedIndex', {
    configurable: true,
    get() { return idxDesc.get.call(this); },
    set(v) { idxDesc.set.call(this, v); syncDisplay(); }
  });

  // form.reset() restores defaults without events
  if (select.form) select.form.addEventListener('reset', () => setTimeout(syncDisplay, 0));

  // If a required select fails native validation, send the user to the visible box
  select.addEventListener('invalid', () => { input.focus(); });

  syncDisplay();
}

export function enhanceSelects(ids) {
  ids.forEach(id => enhanceSelect(document.getElementById(id)));
}
