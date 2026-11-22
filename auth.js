"use strict";
(function () {
  const AUTH_KEY = "rbi_signed_in";
  const USER = "root";
  const PASS = "root";
  const waiting = [];

  function isLocked() {
    return document.documentElement.classList.contains("auth-locked");
  }

  window.whenSignedIn = function (fn) {
    if (typeof fn !== "function") return;
    if (isLocked()) waiting.push(fn);
    else fn();
  };

  function unlock() {
    try { sessionStorage.setItem(AUTH_KEY, "1"); } catch (_) {}
    document.documentElement.classList.remove("auth-locked");
    setTimeout(() => {
      while (waiting.length) {
        const fn = waiting.shift();
        try { fn(); } catch (e) { console.error(e); }
      }
    }, 0);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("auth-form");
    if (!form) return;
    if (isLocked()) {
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
