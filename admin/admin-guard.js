(() => {
  "use strict";

  const LOGIN_PATH = "/admin/";

  function redirectToLogin() {
    const current =
      location.pathname +
      location.search +
      location.hash;

    location.replace(
      LOGIN_PATH + "?return=" + encodeURIComponent(current)
    );
  }

  async function requireSession() {
    if (!window.AdminAuth?.sessionStatus) {
      redirectToLogin();
      return false;
    }

    try {
      await window.AdminAuth.sessionStatus();

      document.documentElement.classList.add(
        "admin-session-authenticated"
      );

      return true;
    } catch {
      redirectToLogin();
      return false;
    }
  }

  window.AdminGuard = {
    requireSession,
    redirectToLogin,
    ready: requireSession()
  };
})();
