const TOKEN_KEY = "klh_lf_token_v2";
const SIGNED_OUT_KEY = "klh_signed_out";

let memoryToken = "";
let memorySignedOut = false;

function safeGetStorage(storage, key) {
  try {
    return storage.getItem(key) || "";
  } catch {
    return "";
  }
}

function safeSetStorage(storage, key, value) {
  try {
    if (value) {
      storage.setItem(key, value);
    } else {
      storage.removeItem(key);
    }
  } catch {
    return;
  }
}

export function getStoredToken() {
  if (memoryToken) return memoryToken;
  const fromStorage =
    typeof window !== "undefined" ? safeGetStorage(window.localStorage, TOKEN_KEY) : "";
  if (fromStorage) {
    memoryToken = fromStorage;
  }
  return fromStorage;
}

export function setStoredToken(token) {
  memoryToken = token || "";
  if (typeof window !== "undefined") {
    safeSetStorage(window.localStorage, TOKEN_KEY, memoryToken);
  }
}

export function isExplicitlySignedOut() {
  if (memorySignedOut) return true;
  if (typeof window !== "undefined") {
    return safeGetStorage(window.sessionStorage, SIGNED_OUT_KEY) === "1";
  }
  return false;
}

export function setExplicitlySignedOut(flag) {
  memorySignedOut = Boolean(flag);
  if (typeof window !== "undefined") {
    safeSetStorage(window.sessionStorage, SIGNED_OUT_KEY, flag ? "1" : "");
  }
}

function formatErrorDetail(data) {
  if (!data) return "Something went wrong. Please try again.";
  if (typeof data.detail === "string" && data.detail.trim()) {
    return data.detail;
  }
  if (Array.isArray(data.detail) && data.detail.length > 0) {
    const first = data.detail[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") {
      const loc = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : "";
      const fieldName = String(loc || "field").replace(/_/g, " ");
      const msg = String(first.msg || "is invalid").replace(
        new RegExp("^Value error,\\s*", "i"),
        ""
      );
      return `Please check ${fieldName}: ${msg}.`;
    }
  }
  return "Something went wrong. Please try again.";
}

async function request(url, options = {}) {
  const token = getStoredToken();
  const timeoutMs = options.timeoutMs || 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(token
      ? {
          Authorization: `Bearer ${token}`,
          "X-KLH-Token": token
        }
      : {}),
    ...(options.headers || {})
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: "same-origin",
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(formatErrorDetail(data));
    }
    return data;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  getSummary: () => request("/api/summary"),
  getCategories: () => request("/api/categories"),
  getLocations: () => request("/api/locations"),
  getDemoAccounts: () => request("/api/auth/demo-accounts"),
  login: (identifier, password) =>
    request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password })
    }),
  register: (payload) =>
    request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  logout: () =>
    request("/api/auth/logout", {
      method: "POST"
    }).catch(() => ({})),
  me: () => request("/api/auth/me"),
  listItems: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") {
        qs.set(k, String(v));
      }
    });
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request(`/api/items${suffix}`);
  },
  getItem: (id) => request(`/api/items/${id}`, { timeoutMs: 6000 }),
  createItem: (payload) =>
    request("/api/items", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateItem: (id, payload) =>
    request(`/api/items/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  deleteItem: (id) =>
    request(`/api/items/${id}`, {
      method: "DELETE"
    }),
  addSighting: (id, note) =>
    request(`/api/items/${id}/sightings`, {
      method: "POST",
      body: JSON.stringify({ note })
    }),
  updateItemStatus: (id, status, note = "") =>
    request(`/api/items/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, note })
    }),
  listMatches: (mineOnly = false) =>
    request(`/api/matches${mineOnly ? "?mine_only=true" : ""}`),
  dismissMatch: (matchId) =>
    request(`/api/matches/${matchId}/dismiss`, {
      method: "POST"
    }),
  submitClaim: (payload) =>
    request("/api/claims", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  listClaims: () => request("/api/claims"),
  verifyClaim: (claimId, payload) =>
    request(`/api/claims/${claimId}/verify`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  verifyPickupPass: (pickupCode) =>
    request("/api/claims/verify-pass", {
      method: "POST",
      body: JSON.stringify({ pickup_code: pickupCode })
    }),
  getNotifications: (userId) =>
    request(`/notify-api/notifications?userId=${encodeURIComponent(userId || 0)}`, {
      timeoutMs: 3500
    }).catch(() => ({
      unreadCount: 0,
      items: []
    })),
  markAllNotificationsRead: (userId) =>
    request("/notify-api/notifications/read-all", {
      method: "POST",
      body: JSON.stringify({ userId }),
      timeoutMs: 3500
    }).catch(() => ({}))
};
