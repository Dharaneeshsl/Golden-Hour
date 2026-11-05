export const OFFLINE_CARD_KEY = "goldenhour_offline_card";
export const CARD_TTL = 24 * 60 * 60 * 1000;
export function cardUrl(value, origin) {
  const url = new URL(value, origin);
  if (url.origin !== origin || url.pathname !== "/emergency/card" || url.search || !/^#[a-f0-9]{64}$/.test(url.hash)) throw new Error("Scan a GoldenHour card issued by this hospital.");
  return url;
}
export function saveOfflineCard(value, storage = localStorage, now = Date.now()) {
  const url = cardUrl(value, window.location.origin);
  storage.setItem(OFFLINE_CARD_KEY, JSON.stringify({token:url.hash.slice(1), expiresAt:now+CARD_TTL}));
}
export function readOfflineCard(storage = localStorage, now = Date.now()) {
  try {
    const value = JSON.parse(storage.getItem(OFFLINE_CARD_KEY));
    if (!value || !/^[a-f0-9]{64}$/.test(value.token) || !Number.isFinite(value.expiresAt) || value.expiresAt <= now || value.expiresAt > now+CARD_TTL) throw new Error("expired");
    return value;
  } catch {storage.removeItem(OFFLINE_CARD_KEY);return null;}
}
