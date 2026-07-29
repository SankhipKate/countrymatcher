const BREVO_FORM_ENDPOINT = "";

const form = document.querySelector("#updates-form");
const message = form?.querySelector(".form-message");
const button = form?.querySelector("button");

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!BREVO_FORM_ENDPOINT) {
    message.textContent =
      "Форма готова к подключению Brevo. Ссылка подписки будет добавлена следующим обновлением.";
    message.className = "form-message error";
    return;
  }

  button.disabled = true;
  button.textContent = "Сохраняем…";

  try {
    const response = await fetch(BREVO_FORM_ENDPOINT, {
      method: "POST",
      body: new FormData(form),
    });

    if (!response.ok) throw new Error("subscription failed");

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
