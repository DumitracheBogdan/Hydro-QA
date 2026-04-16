import { DYNAMIC_TEXT_PATTERNS } from './route-config.mjs';

export function isDynamicText(s) {
  if (!s) return false;
  const trimmed = s.trim();
  if (!trimmed) return false;
  return DYNAMIC_TEXT_PATTERNS.some((rx) => rx.test(trimmed));
}

export function applyChromeFilter(elements) {
  const out = [];
  for (const el of elements) {
    if (isDynamicText(el.name)) continue;
    if (el.role === 'heading' && isDynamicText(el.text)) continue;
    out.push(el);
  }
  return out;
}
