export const QA_PINNED_VISIT_UUID = 'c7687462-9a25-4969-a35f-70c8dbfe7c2a';

export const ROUTES = [
  { path: '/dashboard', mode: 'chrome' },
  { path: '/visits', mode: 'chrome' },
  { path: '/customers', mode: 'chrome' },
  { path: '/visits-list', mode: 'chrome' },
  { path: '/visits/addnewvisit', mode: 'chrome' },
  {
    path: `/visits/details/${QA_PINNED_VISIT_UUID}`,
    mode: 'chrome',
    canonicalAs: '/visits/details/qa-pinned',
  },
];

export const EXCLUDE_ANCESTOR_SELECTORS = [
  'tbody',
  '[role="row"]',
  '[role="rowgroup"]:not(:first-of-type)',
  '[aria-label^="Scheduled visit"]',
];

export const DYNAMIC_TEXT_PATTERNS = [
  /^[£$€]\s?[\d,]+(\.\d+)?$/,
  /^[+-]?\d+(\.\d+)?\s?%$/,
  /^\d{1,3}(,\d{3})+$/,
  /^\d{1,6}$/,
  /^Showing\s+\d+\s+of\s+\d+/i,
  /^Page\s+\d+\s+of\s+\d+/i,
  /^\(\d+\)$/,
  /^(Today|Yesterday|Tomorrow)([\s,]|$)/i,
  /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b/i,
  /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2}(,\s*\d{4})?$/i,
  /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4}$/i,
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
  /^\d{4}-\d{2}-\d{2}/,
  /^\d{1,2}:\d{2}(:\d{2})?(\s*[AP]M)?$/i,
];
