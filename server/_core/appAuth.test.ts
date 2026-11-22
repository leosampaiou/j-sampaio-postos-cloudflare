import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  hashPassword,
  hashToken,
  verifyPassword,
} from "./appAuth";

describe("application authentication primitives", () => {
  it("hashes and verifies passwords using the persisted scrypt format", async () => {
    const encoded = await hashPassword("correct horse battery staple");

    expect(encoded).toMatch(
      /^scrypt\$16384\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/
    );
    await expect(
      verifyPassword("correct horse battery staple", encoded)
    ).resolves.toBe(true);
    await expect(verifyPassword("incorrect password", encoded)).resolves.toBe(
      false
    );
  });

  it.each(["", "scrypt", "scrypt$16384$8$1$bad$bad", "argon2$hash"])(
    "rejects malformed or unsupported password hashes (%s)",
    async encoded => {
      await expect(verifyPassword("any password", encoded)).resolves.toBe(
        false
      );
    }
  );

  it("hashes session tokens deterministically without returning the token", () => {
    const token = "opaque-session-token";
    const digest = hashToken(token);

    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toBe(token);
    expect(hashToken(token)).toBe(digest);
  });

  it("compares equal values and rejects different values and lengths", () => {
    expect(constantTimeEqual("same", "same")).toBe(true);
    expect(constantTimeEqual("same", "else")).toBe(false);
    expect(constantTimeEqual("short", "longer")).toBe(false);
  });
});
