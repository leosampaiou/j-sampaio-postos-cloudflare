import { serialize } from "cookie";

const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export function appendSessionCookie(
  headers: Headers,
  name: string,
  value: string
) {
  headers.append(
    "Set-Cookie",
    serialize(name, value, {
      httpOnly: true,
      path: "/",
      sameSite: "none",
      secure: true,
      maxAge: SESSION_MAX_AGE_SECONDS,
    })
  );
}

export function appendExpiredSessionCookie(headers: Headers, name: string) {
  headers.append(
    "Set-Cookie",
    serialize(name, "", {
      httpOnly: true,
      path: "/",
      sameSite: "none",
      secure: true,
      maxAge: 0,
      expires: new Date(0),
    })
  );
}
