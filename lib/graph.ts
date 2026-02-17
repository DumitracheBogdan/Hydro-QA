import { getGraphAccessToken } from "@/lib/session";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";

export async function graphRequest(path: string, init: RequestInit = {}) {
  const token = await getGraphAccessToken();
  if (!token) throw new Error("Graph token unavailable");

  const response = await fetch(`${GRAPH_ROOT}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {})
    }
  });

  return response;
}

export async function graphJson<T>(path: string, init: RequestInit = {}) {
  const response = await graphRequest(path, init);
  if (!response.ok) {
    throw new Error(`Graph error ${response.status}`);
  }
  return (await response.json()) as T;
}