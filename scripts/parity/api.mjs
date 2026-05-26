// Thin Hydrocert REST client with injectable fetch (for unit tests).
export function makeClient(baseUrl, fetchImpl = fetch) {
  let token = null;
  const base = baseUrl.replace(/\/$/, "");
  async function parse(res, method, path) {
    if (!res.ok) {
      let body = "";
      try { body = JSON.stringify(await res.json()); } catch { /* non-json */ }
      throw new Error(`${method} ${path} -> ${res.status} ${body}`);
    }
    if (res.status === 204) return null;
    try { return await res.json(); } catch { return null; }
  }
  return {
    async login(email, password) {
      const res = await fetchImpl(`${base}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await parse(res, "POST", "/auth/login");
      token = data?.tokens?.accessToken;
      if (!token) throw new Error("login: no accessToken in response");
      return data.user;
    },
    get token() { return token; },
    async get(path) {
      const res = await fetchImpl(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      return parse(res, "GET", path);
    },
    async post(path, body) {
      const res = await fetchImpl(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      return parse(res, "POST", path);
    },
  };
}
