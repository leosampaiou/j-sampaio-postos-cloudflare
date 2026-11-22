export const CSRF_STORAGE_KEY = "jsampaio-csrf";

export function storeCsrfToken(token: string) {
  try {
    sessionStorage.setItem(CSRF_STORAGE_KEY, token);
  } catch {
    /* storage can be disabled */
  }
}
export function clearCsrfToken() {
  try {
    sessionStorage.removeItem(CSRF_STORAGE_KEY);
  } catch {
    /* storage can be disabled */
  }
}
