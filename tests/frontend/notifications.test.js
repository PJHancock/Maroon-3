import { test } from "node:test";
import assert from "node:assert/strict";
import { notificationBlocker, BLOCKER_MESSAGES } from "../../frontend/notifications.js";

const androidHttps = { secure: true, isIOS: false, standalone: false, hasNotification: true, hasServiceWorker: true, permission: "default" };
const iphoneApp = { secure: true, isIOS: true, standalone: true, hasNotification: true, hasServiceWorker: true, permission: "default" };

test("Android Chrome over https can show notifications", () => {
  assert.equal(notificationBlocker(androidHttps), null);
  assert.equal(notificationBlocker({ ...androidHttps, permission: "granted" }), null);
});

test("a plain http:// LAN link is blocked first, whatever the phone", () => {
  assert.equal(notificationBlocker({ ...androidHttps, secure: false }), "insecure");
  assert.equal(notificationBlocker({ ...iphoneApp, secure: false }), "insecure");
});

test("iPhone needs the Home Screen app, even before the API check", () => {
  // In a Safari tab iOS hides the Notification API entirely.
  assert.equal(notificationBlocker({ ...iphoneApp, standalone: false, hasNotification: false }), "ios-home-screen");
  assert.equal(notificationBlocker(iphoneApp), null, "Home Screen app over https works");
});

test("missing APIs and blocked permission are reported", () => {
  assert.equal(notificationBlocker({ ...androidHttps, hasNotification: false }), "unsupported");
  assert.equal(notificationBlocker({ ...androidHttps, hasServiceWorker: false }), "unsupported");
  assert.equal(notificationBlocker({ ...androidHttps, permission: "denied" }), "denied");
});

test("every blocker has a user-facing explanation", () => {
  for (const key of ["insecure", "ios-home-screen", "unsupported", "denied", "dismissed"]) {
    assert.ok(BLOCKER_MESSAGES[key]?.length > 20, key);
  }
  assert.match(BLOCKER_MESSAGES["ios-home-screen"], /Add to Home Screen/);
  assert.match(BLOCKER_MESSAGES.insecure, /https:\/\//);
});
