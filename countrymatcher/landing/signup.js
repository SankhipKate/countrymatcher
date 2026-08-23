const BREVO_FORM_ENDPOINT = 'https://c2230e4f.sibforms.com/serve/MUIFAOJp3uexo2J9VcbDAfs30aRdkFIk40I2FpHG0wrikEllHdqV_1G27lvXY46KExUV90P0XIi5wpfqDXHdfE_cOVLgYiq8l86IzIEzEHTBhgyHdov6iKnTkUBYo9wj6himrFL6_kQc3__6OjHtWUtEldL8dyLo2wF3auqC63vYqCCev8TqMLP3Z_2iP97B77pgXfRUsNS_WdKB8A==';

const form = document.querySelector("#updates-form");
const message = document.querySelector("#updates-message");
const button = form?.querySelector('button[type="submit"]');
const emailInput = form?.querySelector('input[type="email"]');
const consentInput = form?.querySelector("#updates-marketing-consent");

function setMessage(text, isError = false) {
  if (!message) return;
  message.textContent = text;
  message.dataset.state = isError ? "error" : "ok";
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = emailInput?.value.trim() || "";

  if (!email) {
    setMessage("Введите email.", true);
    emailInput?.focus();
    return;
  }

  if (!emailInput.checkValidity()) {
    setMessage("Проверьте формат email.", true);
    emailInput.focus();
    return;
  }

  if (!consentInput?.checked) {
    setMessage("Для подписки нужно подтвердить согласие на email-обновления.", true);
    consentInput?.focus();
    return;
  }

  button.disabled = true;
  const previousLabel = button.textContent;
  button.textContent = "Сохраняем…";

  const body = new URLSearchParams({
    EMAIL: email,
    email_address_check: "",
    locale: "en",
    html_type: "simple",
  });

  try {
    await fetch(BREVO_FORM_ENDPOINT, {
      method: "POST",
      mode: "no-cors",
      body,
    });

    form.reset();
    setMessage("Готово! Email принят. Вы сможете отписаться в любой момент.");
  } catch {
    setMessage("Попробуйте ещё раз чуть позже.", true);
  } finally {
    button.disabled = false;
    button.textContent = previousLabel;
  }
});
