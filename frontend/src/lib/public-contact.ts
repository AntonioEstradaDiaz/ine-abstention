/** Variables públicas configuradas por el operador, nunca credenciales. */
export function publicContact() {
  const value = process.env.SUPPORT_CONTACT_EMAIL?.trim() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}
export function publicController() {
  return process.env.DATA_CONTROLLER_NAME?.trim() || null;
}
