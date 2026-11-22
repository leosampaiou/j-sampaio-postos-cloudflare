import { describe, expect, it } from "vitest";
import { APP_SESSION_COOKIE } from "./_core/appAuth";
import { appendSessionCookie } from "./_core/cookies";

describe("application session cookie", () => {
  it("uses a distinct secure app cookie behind an HTTPS proxy", () => {
    expect(APP_SESSION_COOKIE).toBe("jsampaio_session");

    const headers = new Headers();
    appendSessionCookie(headers, APP_SESSION_COOKIE, "session-token");
    const [cookie] = headers.getSetCookie();

    expect(cookie).toContain(`${APP_SESSION_COOKIE}=session-token`);
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=None");
  });
});
