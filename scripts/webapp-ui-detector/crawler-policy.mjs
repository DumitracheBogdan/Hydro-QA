const DENY = [
  'delete', 'remove', 'submit', 'save', 'send', 'confirm',
  'pay', 'charge', 'logout', 'sign out', 'clear', 'reset', 'archive',
  'publish', 'approve', 'reject', 'upload',
];

const SOFT_DENY = [
  'create visit', 'create report', 'create customer',
];

export function isSafeToClick(name, role) {
  const n = (name || '').toLowerCase().trim();
  if (!n) return false;
  if (n.length > 80) return false;
  if (DENY.some((w) => n.includes(w))) return false;
  if (SOFT_DENY.some((w) => n.includes(w))) return false;
  return true;
}

export function isDenied(name) {
  const n = (name || '').toLowerCase().trim();
  if (DENY.some((w) => n.includes(w))) return true;
  if (SOFT_DENY.some((w) => n.includes(w))) return true;
  return false;
}
