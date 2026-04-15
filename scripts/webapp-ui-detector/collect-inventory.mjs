export async function collectInventory(page) {
  return page.evaluate(() => {
    const SEL = 'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="combobox"], [role="option"], h1, h2, h3, label, th';

    function cssPath(el) {
      if (!(el instanceof Element)) return '';
      const parts = [];
      let cur = el;
      while (cur && cur.nodeType === 1 && parts.length < 6) {
        let part = cur.nodeName.toLowerCase();
        if (cur.id) { part += `#${cur.id}`; parts.unshift(part); break; }
        const cls = (cur.getAttribute('class') || '').trim().split(/\s+/).slice(0, 2).join('.');
        if (cls) part += `.${cls}`;
        const parent = cur.parentElement;
        if (parent) {
          const sibs = Array.from(parent.children).filter((c) => c.nodeName === cur.nodeName);
          if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
        }
        parts.unshift(part);
        cur = cur.parentElement;
      }
      return parts.join(' > ');
    }

    function accessibleName(el) {
      const aria = el.getAttribute('aria-label');
      if (aria) return aria.trim();
      const labelledby = el.getAttribute('aria-labelledby');
      if (labelledby) {
        const ref = document.getElementById(labelledby);
        if (ref) return (ref.textContent || '').trim();
      }
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
        const id = el.id;
        if (id) {
          const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
          if (lbl) return (lbl.textContent || '').trim();
        }
        if (el.placeholder) return el.placeholder.trim();
        if (el.name) return el.name.trim();
      }
      const alt = el.getAttribute('alt');
      if (alt) return alt.trim();
      const title = el.getAttribute('title');
      if (title) return title.trim();
      const text = (el.innerText || el.textContent || '').trim();
      return text.slice(0, 160);
    }

    function computeRole(el) {
      const explicit = el.getAttribute('role');
      if (explicit) return explicit;
      const tag = el.tagName.toLowerCase();
      if (tag === 'button') return 'button';
      if (tag === 'a') return 'link';
      if (tag === 'input') {
        const t = (el.getAttribute('type') || 'text').toLowerCase();
        if (t === 'checkbox') return 'checkbox';
        if (t === 'radio') return 'radio';
        if (t === 'submit' || t === 'button') return 'button';
        return 'textbox';
      }
      if (tag === 'textarea') return 'textbox';
      if (tag === 'select') return 'combobox';
      if (tag === 'th') return 'columnheader';
      if (tag === 'label') return 'label';
      if (/^h[1-3]$/.test(tag)) return 'heading';
      return tag;
    }

    function isVisible(el) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
      return true;
    }

    const nodes = Array.from(document.querySelectorAll(SEL));
    const out = [];
    const seen = new Set();
    for (const el of nodes) {
      if (!isVisible(el)) continue;
      const role = computeRole(el);
      const name = accessibleName(el);
      const text = (el.innerText || el.textContent || '').trim().slice(0, 200);
      const r = el.getBoundingClientRect();
      const scrollX = window.scrollX || 0;
      const scrollY = window.scrollY || 0;
      const bbox = {
        x: Math.round(r.left + scrollX),
        y: Math.round(r.top + scrollY),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
      const selectorHint = cssPath(el);
      const key = `${role}::${name}::${selectorHint}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ role, name, text, selectorHint, bbox });
    }
    return out;
  });
}
