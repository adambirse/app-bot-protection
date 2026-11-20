import { normalisePath, isValidPath, MAX_PATH_LENGTH } from "./paths";

export const LIMITS = { path: MAX_PATH_LENGTH, title: 200, body: 10_000 } as const;

export type ValidationCode =
  | "invalid_path"
  | "path_too_long"
  | "title_required"
  | "title_too_long"
  | "body_too_long"
  | "invalid_id"
  | "not_found";

/** An expected, user-facing failure. Only the code is shown to users, never a message. */
export class ValidationError extends Error {
  override name = "ValidationError";
  constructor(readonly code: ValidationCode) {
    super(code);
  }
}

export type PageInput = { path: string; title: string; body: string };

export function validatePageInput(input: { path: unknown; title: unknown; body: unknown }): PageInput {
  const rawPath = typeof input.path === "string" ? input.path : "";
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const body = typeof input.body === "string" ? input.body : "";

  if (rawPath.length > LIMITS.path * 2) throw new ValidationError("path_too_long");
  const path = normalisePath(rawPath);
  if (path.length > LIMITS.path) throw new ValidationError("path_too_long");
  if (!isValidPath(path)) throw new ValidationError("invalid_path");
  if (!title) throw new ValidationError("title_required");
  if (title.length > LIMITS.title) throw new ValidationError("title_too_long");
  if (body.length > LIMITS.body) throw new ValidationError("body_too_long");
  return { path, title, body };
}

export function parseId(raw: unknown): number {
  if (typeof raw !== "string" || !/^[1-9][0-9]{0,9}$/.test(raw)) throw new ValidationError("invalid_id");
  const id = Number(raw);
  if (id > 2_147_483_647) throw new ValidationError("invalid_id");
  return id;
}
