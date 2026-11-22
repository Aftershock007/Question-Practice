"use strict";
// ============================================================================
// Sign-in gate: fixed credentials (username "root", password "root").
// Until the right credentials are entered the whole app stays hidden
// (html.auth-locked, set by the small script in index.html's <head>).
// Signing in lasts for the browser session (sessionStorage).
// Note: this is a static site, so this is a simple lock screen, not real
// server-side security.
// ============================================================================
(function () {
  const AUTH_KEY = "rbi_signed_in";
  const USER = "root";
  const PASS = "root";

  // Show the app after a correct sign-in
  function unlock() {
    try { sessionStorage.setItem(AUTH_KEY, "1"); } catch (_) { /* this tab only */ }
    document.documentElement.classList.remove("auth-locked");
  }

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("auth-form");
    if (!form) return;
    if (document.documentElement.classList.contains("auth-locked")) {
      const u = document.getElementById("auth-user");
      if (u) u.focus();
    }
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const user = document.getElementById("auth-user");
      const pass = document.getElementById("auth-pass");
      const err = document.getElementById("auth-error");
      if (user.value.trim() === USER && pass.value === PASS) {
        err.textContent = "";
        pass.value = "";
        unlock();
      } else {
        err.textContent = "Wrong username or password.";
        pass.value = "";
        pass.focus();
      }
    });
  });
})();
