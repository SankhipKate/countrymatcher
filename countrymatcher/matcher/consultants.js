export function activeConsultantsForCountry(data, countryId) {
  const consultants = data?.countries?.[countryId];
  if (!Array.isArray(consultants)) return [];
  return consultants.filter((consultant) => consultant?.active === true);
}

export function telegramConsultantUrl(consultant) {
  const username = String(consultant?.telegram_username || '').trim().replace(/^@+/, '');
  if (!username || !/^[A-Za-z0-9_]+$/.test(username)) return null;

  const message = String(consultant?.telegram_message_ru || '').trim();
  const baseUrl = `https://t.me/${username}`;

  return message ? `${baseUrl}?text=${encodeURIComponent(message)}` : baseUrl;
}
