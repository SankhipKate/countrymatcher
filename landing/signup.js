const BREVO_FORM_ENDPOINT =
  "https://c2230e4f.sibforms.com/serve/MUIFAOJp3uexo2J9VcbDAfs30aRdkFIk40I2FpHG0wrikEllHdqV_1G27lvXY46KExUV90P0XIi5wpfqDXHdfE_cOVLgYiq8l86IzIEzEHTBhgyHdov6iKnTkUBYo9wj6himrFL6_kQc3__6OjHtWUtEldL8dyLo2wF3auqC63vYqCCev8TqMLP3Z_2iP97B77pgXfRUsNS_WdKB8A==";

const form = document.querySelector("#updates-form");
const message = form?.querySelector(".form-message");
const button = form?.querySelector("button");
const emailInput = form?.querySelector('input[type="email"]');

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = emailInput?.value.trim();

  if (!email) {
    message.textContent = "Введите email.";
    message.className = "form-message error";
    emailInput?.focus();
    return;
  }

  button.disabled = true;
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
    message.textContent =
      "Готово! Сообщим, когда появятся новые страны и возможности.";
    message.className = "form-message success";
  } catch {
    message.textContent = "Попробуйте ещё раз чуть позже.";
    message.className = "form-message error";
  } finally {
    button.disabled = false;
    button.textContent = "Получать обновления →";
  }
});

const paymentModal = document.querySelector("#payment-modal");
const paymentModalTriggers = document.querySelectorAll(
  ".payment-modal-trigger",
);
const paymentModalClose = paymentModal?.querySelector(".payment-modal-close");

paymentModalTriggers.forEach((trigger) => {
  trigger.addEventListener("click", () => paymentModal?.showModal());
});

paymentModalClose?.addEventListener("click", () => paymentModal.close());

paymentModal?.addEventListener("click", (event) => {
  if (event.target === paymentModal) paymentModal.close();
});
