import { describe, it, expect } from "vitest";
import { normalisePath, isValidPath, pathFromSegments } from "./paths";
import { validatePageInput, parseId, ValidationError, LIMITS } from "./validation";

describe("normalisePath", () => {
  it.each([
    ["About/Team/", "/about/team"],
    ["/a//b///c", "/a/b/c"],
    ["/", "/"],
    ["", "/"],
    ["  /x?y=1#z ", "/x"],
  ])("%j -> %j", (input, expected) => expect(normalisePath(input)).toBe(expected));
});

describe("isValidPath", () => {
  it.each(["/", "/about", "/a-b/c_d/e.f/g~h"])("accepts %s", (p) => expect(isValidPath(p)).toBe(true));
  it.each(["/a b", "/a/", "//a", "/A", "/a/../b", "/./a", "/a%20", "/é", "/" + "a".repeat(255)])(
    "rejects %j",
    (p) => expect(isValidPath(p)).toBe(false),
  );
});

describe("pathFromSegments", () => {
  it("decodes each segment exactly once", () => {
    expect(pathFromSegments(["about", "team"])).toBe("/about/team");
    expect(pathFromSegments([])).toBe("/");
    expect(pathFromSegments(["%61bout"])).toBe("/about");
    // %2525 decodes once to "%25", which is not a valid path character.
    expect(pathFromSegments(["x%2525"])).toBeNull();
  });

  it.each([
    ["malformed encoding", ["%E0%A4%A"]],
    ["lone percent", ["%"]],
    ["encoded slash", ["a%2Fb"]],
    ["dot segment", [".."]],
    ["encoded dot segment", ["%2E%2E"]],
    ["quote injection attempt", ["%27%20OR%201%3D1--"]],
    ["too long", ["a".repeat(300)]],
  ])("rejects %s", (_name, segments) => expect(pathFromSegments(segments)).toBeNull());
});

describe("validatePageInput", () => {
  const ok = { path: "/About", title: " Hi ", body: "b" };
  const code = (input: Record<string, unknown>) => {
    try {
      validatePageInput({ ...ok, ...input });
      return "ok";
    } catch (e) {
      return (e as ValidationError).code;
    }
  };

  it("normalises and trims", () => {
    expect(validatePageInput(ok)).toEqual({ path: "/about", title: "Hi", body: "b" });
  });

  it("enforces limits and formats", () => {
    expect(code({ path: "/a b" })).toBe("invalid_path");
    expect(code({ path: "/" + "a".repeat(LIMITS.path) })).toBe("path_too_long");
    expect(code({ path: "/" + "a".repeat(LIMITS.path * 3) })).toBe("path_too_long");
    expect(code({ title: "   " })).toBe("title_required");
    expect(code({ title: null })).toBe("title_required");
    expect(code({ title: "t".repeat(LIMITS.title + 1) })).toBe("title_too_long");
    expect(code({ body: "b".repeat(LIMITS.body + 1) })).toBe("body_too_long");
    expect(code({ title: "t".repeat(LIMITS.title), body: "b".repeat(LIMITS.body) })).toBe("ok");
  });
});

describe("parseId", () => {
  it("accepts positive integers", () => expect(parseId("42")).toBe(42));
  it.each([null, "", "0", "-1", "1.5", "abc", "1e3", " 1", "01", "99999999999", "2147483648"])(
    "rejects %j",
    (raw) => expect(() => parseId(raw)).toThrow(ValidationError),
  );
});
