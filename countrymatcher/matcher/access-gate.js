(() => {
  const STORAGE_KEY = "countryMatcherAccess";
  const ACCESS_DAYS = 30;
  const CODE_HASH = "deb85451d42b09e197327c23ddb1b84eff3053c4fe4260bd40916cb4e32fcd0f";

  const gate = document.getElementById("accessGate");
  const form = document.getElementById("accessForm");
  const input = document.getElementById("accessCode");
  const error = document.getElementById("accessError");

  function hasActiveAccess() {
    const grantedAt = Number(localStorage.getItem(STORAGE_KEY));
    return grantedAt && Date.now() - grantedAt < ACCESS_DAYS * 86400000;
  }

  function unlock() {
    document.documentElement.classList.remove("access-locked");
    gate.hidden = true;
  }

  async function hash(value) {
    const bytes = new TextEncoder().encode(value.trim().toUpperCase());
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  if (hasActiveAccess()) {
    unlock();
    return;
  }

  input.focus();

  form.addEventListener("submit", async event => {
    event.preventDefault();
    error.hidden = true;

    if (await hash(input.value) === CODE_HASH) {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
      unlock();
      window.scrollTo(0, 0);
      return;
    }

    error.hidden = false;
    input.select();
  });
})();
