export const API_BASE_URL =
  typeof window !== "undefined"
    ? "/api"
    : (process.env.API_BASE_URL ?? "http://localhost:8080/api");

/** Convert a relative upload path (e.g. /uploads/photo.jpg) to a full URL */
export function staticUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return path;
}

/* ── Token helpers (localStorage) ─────────────────────────────────── */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("accessToken");
}

export function setToken(token: string): void {
  localStorage.setItem("accessToken", token);
}

export function clearToken(): void {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("trialDaysLeft");
}

/* ── Authenticated fetch wrapper ───────────────────────────────────── */
export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }

  return res;
}
