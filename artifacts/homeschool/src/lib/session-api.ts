// Tokens stay in memory; the session credential is an HttpOnly cookie.
let csrfToken: string | null = null;
export const setCsrfToken = (token: string | null) => {
  csrfToken = token;
};
const fetchHost = window as typeof window & {
  __anchorNativeFetch?: typeof window.fetch;
};
const originalFetch =
  fetchHost.__anchorNativeFetch ?? window.fetch.bind(window);
fetchHost.__anchorNativeFetch = originalFetch;
window.fetch = async (input, init) => {
  const url = new URL(
    input instanceof Request ? input.url : String(input),
    window.location.href,
  );
  if (
    url.origin !== window.location.origin ||
    !url.pathname.startsWith("/api/")
  )
    return originalFetch(input, init);
  const method = (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  const headers = new Headers(
    input instanceof Request ? input.headers : undefined,
  );
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers.set("X-Requested-With", "AnchorOne");
    if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  }
  const response = await originalFetch(input, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  if (response.status === 401 && !url.pathname.startsWith("/api/auth/"))
    window.dispatchEvent(new Event("session-expired"));
  return response;
};
