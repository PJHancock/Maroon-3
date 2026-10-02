(function (root) {
  "use strict";

  const Buddy = (root.NetworkingBuddy = root.NetworkingBuddy || {});

  async function api(path, options) {
    const response = await fetch(path, {
      credentials: "same-origin",
      ...(options || {}),
      headers: { "Content-Type": "application/json", ...((options || {}).headers || {}) },
    });
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch (_) { payload = { detail: text }; }
    if (!response.ok) throw new Error(payload.detail || `Request failed (${response.status})`);
    return payload;
  }

  Buddy.api = api;
})(window);
