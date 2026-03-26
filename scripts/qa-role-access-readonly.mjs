import fs from 'node:fs';
import path from 'node:path';

const API_BASE = process.env.HYDROCERT_API_BASE || 'https://hydrocert-prod-api.azurewebsites.net';
const USER_EMAIL = process.env.HYDROCERT_QA_USER_EMAIL || '';
const USER_PASSWORD = process.env.HYDROCERT_QA_USER_PASSWORD || '';

const stamp = new Date().toISOString().replace(/[.:]/g, '-');
const runName = `infra-role-access-readonly-${stamp}`;
const runDir = path.join(process.cwd(), 'qa-artifacts', 'infra-regression', runName);
fs.mkdirSync(runDir, { recursive: true });

const checks = [];

function add({ id, area, test, status, details }) {
  checks.push({ id, area, test, status, details });
  console.log(`${id} | ${status} | ${test} | ${details}`);
}

async function check(id, area, test, fn) {
  try {
    const result = await fn();
    add({
      id,
      area,
      test,
      status: result?.status || 'PASS',
      details: result?.details || '',
    });
  } catch (error) {
    add({
      id,
      area,
      test,
      status: 'FAIL',
      details: String(error).replace(/\s+/g, ' ').slice(0, 320),
    });
  }
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function safeText(response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function arr(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

async function login(client, email, password) {
  const response = await client.post('/auth/login', {
    data: { email, password },
  });
  const body = await safeJson(response);
  const token = body?.tokens?.accessToken || body?.accessToken || body?.token || '';
  return { response, token };
}

function visitOwnedByUser(visit, profile) {
  const ownId = String(profile?.id || '');
  const ownEmail = norm(profile?.email);
  const participants = [
    ...(Array.isArray(visit?.visitEngineers) ? visit.visitEngineers : []),
    visit?.bookingPerson,
  ].filter(Boolean);

  return participants.some((participant) => {
    const participantId = String(participant?.id || '');
    const participantEmail = norm(participant?.email);
    return participantId === ownId || participantEmail === ownEmail;
  });
}

function visitSummary(visit) {
  const engineers = (Array.isArray(visit?.visitEngineers) ? visit.visitEngineers : [])
    .map((engineer) => engineer?.email)
    .filter(Boolean)
    .join(',');
  return [
    `ref=${visit?.visitReference || visit?.reference || visit?.id || 'n/a'}`,
    `booking=${visit?.bookingPerson?.email || 'n/a'}`,
    `engineers=${engineers || 'n/a'}`,
  ].join(', ');
}

function createClient(baseURL, defaultHeaders = {}) {
  const send = async (method, endpoint, options = {}) => {
    const headers = { ...defaultHeaders, ...(options.headers || {}) };
    const init = { method, headers };

    if (options.data !== undefined) {
      init.body = typeof options.data === 'string' ? options.data : JSON.stringify(options.data);
      if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
        init.headers['content-type'] = 'application/json';
      }
    }

    const response = await fetch(`${baseURL}${endpoint}`, init);
    return {
      status: () => response.status,
      headers: () => Object.fromEntries(response.headers.entries()),
      json: async () => await response.clone().json(),
      text: async () => await response.clone().text(),
    };
  };

  return {
    get: async (endpoint, options) => await send('GET', endpoint, options),
    post: async (endpoint, options) => await send('POST', endpoint, options),
    dispose: async () => {},
  };
}

const anon = createClient(API_BASE);

let api = null;
let actor = {
  source: 'env-user',
  email: USER_EMAIL,
  role: '',
  id: '',
};
let exposure = {
  apiStatus: -1,
  apiJsonStatus: -1,
  docsPublic: false,
};
let roleChecksReason = USER_EMAIL
  ? `actor=${USER_EMAIL}, login not attempted`
  : 'missing HYDROCERT_QA_USER_EMAIL or HYDROCERT_QA_USER_PASSWORD';

try {
  const apiDocs = await anon.get('/api');
  const openApi = await anon.get('/api-json');
  const openApiText = await safeText(openApi);

  exposure.apiStatus = apiDocs.status();
  exposure.apiJsonStatus = openApi.status();
  exposure.docsPublic = apiDocs.status() === 200 || (openApi.status() === 200 && /"openapi"\s*:\s*"/i.test(openApiText));

  await check('RR01', 'Security', 'Swagger docs are not public', async () => {
    return !exposure.docsPublic
      ? { status: 'PASS', details: `/api=${exposure.apiStatus}, /api-json=${exposure.apiJsonStatus}` }
      : { status: 'FAIL', details: `/api=${exposure.apiStatus}, /api-json=${exposure.apiJsonStatus}` };
  });

  await check('RR02', 'Access Control', 'User credentials resolve to user profile', async () => {
    if (!USER_EMAIL || !USER_PASSWORD) {
      roleChecksReason = 'missing HYDROCERT_QA_USER_EMAIL or HYDROCERT_QA_USER_PASSWORD';
      return { status: 'SKIP', details: roleChecksReason };
    }

    const loginResponse = await login(anon, USER_EMAIL, USER_PASSWORD);
    if (loginResponse.response.status() >= 400 || !loginResponse.token) {
      roleChecksReason = `login_status=${loginResponse.response.status()}`;
      return { status: 'FAIL', details: roleChecksReason };
    }

    api = createClient(API_BASE, { Authorization: `Bearer ${loginResponse.token}` });
    const meResponse = await api.get('/users/profile/me');
    const meBody = await safeJson(meResponse);
    actor = {
      ...actor,
      email: String(meBody?.email || USER_EMAIL),
      role: String(meBody?.role || ''),
      id: String(meBody?.id || ''),
    };

    if (meResponse.status() >= 400) {
      roleChecksReason = `profile_status=${meResponse.status()}`;
      return { status: 'FAIL', details: roleChecksReason };
    }

    if (norm(actor.role) !== 'user' || !norm(actor.email)) {
      roleChecksReason = `email=${actor.email || 'n/a'}, role=${actor.role || 'n/a'}`;
      return { status: 'FAIL', details: roleChecksReason };
    }

    roleChecksReason = `actor=${actor.email}, role=${actor.role}`;
    return { status: 'PASS', details: roleChecksReason };
  });

  const roleChecksReady = () => Boolean(api && norm(actor.role) === 'user' && actor.email);

  await check('RR03', 'Access Control', 'User role only sees own visits in calendar filter', async () => {
    if (!roleChecksReady()) return { status: 'SKIP', details: roleChecksReason };

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString();
    const endpoint = `/visits/calendar-filter?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&page=1&limit=10`;
    const response = await api.get(endpoint);
    const body = await safeJson(response);

    if ([401, 403].includes(response.status())) {
      return { status: 'PASS', details: `status=${response.status()}` };
    }

    const items = arr(body);
    if (response.status() >= 400) {
      return { status: 'FAIL', details: `status=${response.status()}` };
    }

    const foreignVisits = items.filter((visit) => !visitOwnedByUser(visit, actor));
    if (foreignVisits.length) {
      return {
        status: 'FAIL',
        details: `foreign=${foreignVisits.length}/${items.length}, sample=${visitSummary(foreignVisits[0])}`,
      };
    }

    return {
      status: 'PASS',
      details: `count=${items.length}, actor=${actor.email}`,
    };
  });

  await check('RR04', 'Access Control', 'User role cannot access team absences of other employees', async () => {
    if (!roleChecksReady()) return { status: 'SKIP', details: roleChecksReason };

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 1).toISOString().slice(0, 10);
    const response = await api.get(`/users/absences?startDate=${start}&endDate=${end}`);
    const body = await safeJson(response);

    if ([401, 403].includes(response.status())) {
      return { status: 'PASS', details: `status=${response.status()}` };
    }

    const items = arr(body);
    if (response.status() >= 400) {
      return { status: 'FAIL', details: `status=${response.status()}` };
    }

    const foreignAbsences = items.filter((entry) => norm(entry?.employee?.email) && norm(entry.employee.email) !== norm(actor.email));
    if (foreignAbsences.length) {
      return {
        status: 'FAIL',
        details: `foreign=${foreignAbsences.length}/${items.length}, sample=${foreignAbsences[0]?.employee?.email || 'n/a'}`,
      };
    }

    return {
      status: 'PASS',
      details: `count=${items.length}, actor=${actor.email}`,
    };
  });

  await check('RR05', 'Access Control', 'User role cannot access activity logs', async () => {
    if (!roleChecksReady()) return { status: 'SKIP', details: roleChecksReason };

    const response = await api.get('/activity-logs');
    const body = await safeJson(response);

    if ([401, 403].includes(response.status())) {
      return { status: 'PASS', details: `status=${response.status()}` };
    }

    if (response.status() >= 200 && response.status() < 300) {
      return {
        status: 'FAIL',
        details: `status=${response.status()}, count=${arr(body).length}`,
      };
    }

    return {
      status: 'FAIL',
      details: `status=${response.status()}`,
    };
  });

  await check('RR06', 'Access Control', 'User role cannot access global reference data', async () => {
    if (!roleChecksReady()) return { status: 'SKIP', details: roleChecksReason };

    const endpoints = ['/sites', '/products', '/job-types', '/skills', '/contracts'];
    const openEndpoints = [];
    const unstableEndpoints = [];

    for (const endpoint of endpoints) {
      const response = await api.get(endpoint);
      const body = await safeJson(response);
      const count = arr(body).length;

      if (response.status() >= 200 && response.status() < 300) {
        openEndpoints.push(`${endpoint}:${response.status()} count=${count}`);
        continue;
      }

      if (![401, 403, 404].includes(response.status())) {
        unstableEndpoints.push(`${endpoint}:${response.status()}`);
      }
    }

    if (openEndpoints.length) {
      return {
        status: 'FAIL',
        details: openEndpoints.join(' | '),
      };
    }

    if (unstableEndpoints.length) {
      return {
        status: 'FAIL',
        details: unstableEndpoints.join(' | '),
      };
    }

    return {
      status: 'PASS',
      details: endpoints.join(', '),
    };
  });
} finally {
  if (api) await api.dispose();
  await anon.dispose();
}

const totals = {
  total: checks.length,
  pass: checks.filter((check) => check.status === 'PASS').length,
  fail: checks.filter((check) => check.status === 'FAIL').length,
  skip: checks.filter((check) => check.status === 'SKIP').length,
};

const summary = {
  generatedAt: new Date().toISOString(),
  environment: {
    apiBase: API_BASE,
    actor: {
      source: actor.source,
      email: actor.email,
      role: actor.role,
      id: actor.id,
    },
    exposure,
  },
  runName,
  totals,
  checks,
};

const summaryPath = path.join(runDir, 'summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

const lines = [];
lines.push('# Role Access Read-Only Report');
lines.push(`Date: ${new Date().toISOString()}`);
lines.push(`API: ${API_BASE}`);
lines.push(`Actor: ${actor.email || 'n/a'} (${actor.role || 'n/a'}) via ${actor.source || 'n/a'}`);
lines.push('');
lines.push('## Summary');
lines.push(`- Total checks: ${totals.total}`);
lines.push(`- Passed: ${totals.pass}`);
lines.push(`- Failed: ${totals.fail}`);
lines.push(`- Skipped: ${totals.skip}`);
lines.push('');
lines.push('## Checks');
lines.push('| ID | Area | Test | Status | Details |');
lines.push('|---|---|---|---|---|');
for (const item of checks) {
  lines.push(`| ${item.id} | ${item.area} | ${String(item.test).replace(/\|/g, '/')} | ${item.status} | ${String(item.details).replace(/\|/g, '/')} |`);
}

const reportPath = path.join(runDir, 'report.md');
fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');

console.log(`SUMMARY_JSON=${summaryPath}`);
console.log(`REPORT_MD=${reportPath}`);
console.log(`TOTAL=${totals.total} PASS=${totals.pass} FAIL=${totals.fail} SKIP=${totals.skip}`);
