import fs from 'node:fs';
import path from 'node:path';

const API_BASE = process.env.HYDROCERT_API_BASE || 'https://hydrocert-dev-api-exajhpd0brg2bcar.ukwest-01.azurewebsites.net';
const ADMIN_EMAIL = process.env.HYDROCERT_QA_EMAIL || '';
const ADMIN_PASSWORD = process.env.HYDROCERT_QA_PASSWORD || '';
const USER_EMAIL = process.env.HYDROCERT_QA_USER_EMAIL || '';
const USER_PASSWORD = process.env.HYDROCERT_QA_USER_PASSWORD || '';
const PROBE_PUBLIC_REGISTER = (process.env.HYDROCERT_QA_PROBE_PUBLIC_REGISTER || '1') !== '0';

const stamp = new Date().toISOString().replace(/[.:]/g, '-');
const runName = `dev-infra-role-access-security-${stamp}`;
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

function uniqueProbeAccount() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    email: `qa.role.access.${suffix}@example.com`,
    password: `HydroQa!${String(Date.now()).slice(-6)}Aa1`,
  };
}

async function login(client, email, password) {
  const response = await client.post('/auth/login', {
    data: { email, password },
  });
  const body = await safeJson(response);
  const token = body?.tokens?.accessToken || body?.accessToken || body?.token || '';
  return { response, body, token };
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
    delete: async (endpoint, options) => await send('DELETE', endpoint, options),
    dispose: async () => {},
  };
}

const anon = createClient(API_BASE);

let api = null;
let adminApi = null;
let cleanupUser = null;
let actor = {
  source: 'none',
  email: '',
  password: '',
  role: '',
  id: '',
};
let exposure = {
  apiStatus: -1,
  apiJsonStatus: -1,
  docsPublic: false,
  registerStatus: -1,
  registerPublic: false,
  registerMessage: '',
};

try {
  const apiDocs = await anon.get('/api');
  const openApi = await anon.get('/api-json');
  const openApiText = await safeText(openApi);

  exposure.apiStatus = apiDocs.status();
  exposure.apiJsonStatus = openApi.status();
  exposure.docsPublic = apiDocs.status() === 200 || (openApi.status() === 200 && /"openapi"\s*:\s*"/i.test(openApiText));

  let registerBody = null;
  if (PROBE_PUBLIC_REGISTER) {
    const registerResponse = await anon.post('/auth/register', {
      data: {},
    });
    registerBody = await safeJson(registerResponse);
    exposure.registerStatus = registerResponse.status();
    exposure.registerPublic = ![401, 403].includes(registerResponse.status());
    exposure.registerMessage = Array.isArray(registerBody?.message)
      ? registerBody.message.join('; ')
      : String(registerBody?.message || registerBody?.error || '');
  }

  if (!actor.email && USER_EMAIL && USER_PASSWORD) {
    actor = {
      source: 'env-user',
      email: USER_EMAIL,
      password: USER_PASSWORD,
      role: '',
      id: '',
    };
  }

  if (!actor.email && ADMIN_EMAIL && ADMIN_PASSWORD) {
    const adminLogin = await login(anon, ADMIN_EMAIL, ADMIN_PASSWORD);
    if (adminLogin.response.status() < 400 && adminLogin.token) {
      adminApi = createClient(API_BASE, { Authorization: `Bearer ${adminLogin.token}` });
      const meResponse = await adminApi.get('/users/profile/me');
      const meBody = await safeJson(meResponse);
      const adminRole = norm(meBody?.role);

      if (meResponse.status() < 400 && adminRole === 'admin') {
        const probeAccount = uniqueProbeAccount();
        const createUserResponse = await adminApi.post('/users', {
          data: {
            email: probeAccount.email,
            passwordHash: probeAccount.password,
            firstName: 'QA',
            lastName: 'RoleAccess',
            role: 'user',
          },
        });
        const createUserBody = await safeJson(createUserResponse);

        if (createUserResponse.status() >= 200 && createUserResponse.status() < 300 && createUserBody?.id) {
          actor = {
            source: 'admin-created-user',
            email: probeAccount.email,
            password: probeAccount.password,
            role: 'user',
            id: String(createUserBody.id),
          };
          cleanupUser = { id: String(createUserBody.id), email: probeAccount.email };
        }
      }
    }
  }

  if (!actor.email && PROBE_PUBLIC_REGISTER) {
    const probeAccount = uniqueProbeAccount();
    const registerResponse = await anon.post('/auth/register', {
      data: {
        email: probeAccount.email,
        password: probeAccount.password,
        passwordConfirmation: probeAccount.password,
      },
    });
    const registerCreateBody = await safeJson(registerResponse);
    if (registerResponse.status() === 201) {
      actor = {
        source: 'public-register',
        email: probeAccount.email,
        password: probeAccount.password,
        role: String(registerCreateBody?.role || 'user'),
        id: String(registerCreateBody?.id || ''),
      };
    }
  }

  await check('RA01', 'Security', 'Swagger docs and anonymous self-registration are not public', async () => {
    const exposedBits = [];
    if (exposure.docsPublic) exposedBits.push(`/api=${exposure.apiStatus}, /api-json=${exposure.apiJsonStatus}`);
    if (exposure.registerPublic) exposedBits.push(`/auth/register=${exposure.registerStatus}`);

    if (!exposedBits.length) {
      return {
        status: 'PASS',
        details: `/api=${exposure.apiStatus}, /api-json=${exposure.apiJsonStatus}, register=${exposure.registerStatus}`,
      };
    }

    return {
      status: 'FAIL',
      details: exposedBits.join(' | '),
    };
  });

  if (actor.email && actor.password) {
    const loginResponse = await anon.post('/auth/login', {
      data: {
        email: actor.email,
        password: actor.password,
      },
    });
    const loginBody = await safeJson(loginResponse);
    const token = loginBody?.tokens?.accessToken || loginBody?.accessToken || loginBody?.token || '';

    if (loginResponse.status() < 400 && token) {
      api = createClient(API_BASE, { Authorization: `Bearer ${token}` });

      const meResponse = await api.get('/users/profile/me');
      const meBody = await safeJson(meResponse);

      if (meResponse.status() < 400) {
        actor = {
          ...actor,
          email: String(meBody?.email || actor.email),
          role: String(meBody?.role || actor.role),
          id: String(meBody?.id || actor.id),
        };
      } else {
        actor = { ...actor, role: 'unknown' };
      }
    }
  }

  const roleChecksReady = Boolean(api && norm(actor.role) === 'user' && actor.email);
  const roleChecksReason = actor.email
    ? `actor=${actor.email}, source=${actor.source}, role=${actor.role || 'unknown'}`
    : 'no role=user account available; set HYDROCERT_QA_USER_EMAIL and HYDROCERT_QA_USER_PASSWORD if public register is disabled';

  await check('RA02', 'Access Control', 'User role cannot create or delete customers via API', async () => {
    if (!roleChecksReady) return { status: 'SKIP', details: roleChecksReason };

    const createResponse = await api.post('/customers', {
      data: { name: `ZZ QA access probe ${Date.now()}` },
    });
    const createBody = await safeJson(createResponse);

    if (createResponse.status() >= 200 && createResponse.status() < 300) {
      let deleteStatus = 'not-run';
      if (createBody?.id) {
        const deleteResponse = await api.delete(`/customers/${createBody.id}`);
        deleteStatus = String(deleteResponse.status());
      }
      return {
        status: 'FAIL',
        details: `create=${createResponse.status()}, delete=${deleteStatus}, customerId=${createBody?.id || 'n/a'}`,
      };
    }

    if (createResponse.status() >= 400 && createResponse.status() < 500) {
      return {
        status: 'PASS',
        details: `create=${createResponse.status()}`,
      };
    }

    return {
      status: 'FAIL',
      details: `create=${createResponse.status()}`,
    };
  });

  await check('RA03', 'Access Control', 'User role only sees own visits in calendar filter', async () => {
    if (!roleChecksReady) return { status: 'SKIP', details: roleChecksReason };

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

  await check('RA04', 'Access Control', 'User role cannot access team absences of other employees', async () => {
    if (!roleChecksReady) return { status: 'SKIP', details: roleChecksReason };

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

  await check('RA05', 'Access Control', 'User role cannot access activity logs', async () => {
    if (!roleChecksReady) return { status: 'SKIP', details: roleChecksReason };

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

  await check('RA06', 'Access Control', 'User role cannot access global reference data', async () => {
    if (!roleChecksReady) return { status: 'SKIP', details: roleChecksReason };

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
  if (adminApi && cleanupUser?.id) {
    try {
      await adminApi.delete(`/users/${cleanupUser.id}`);
    } catch {}
  }
  if (adminApi) await adminApi.dispose();
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
lines.push('# DEV Role Access Security Report');
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
