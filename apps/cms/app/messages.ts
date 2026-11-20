import type { ValidationCode } from "@cms-bot/db/cms";
import { LIMITS } from "@cms-bot/db/cms";

// Fixed text only. Query-string values are used as lookup keys, never displayed.
export const ERROR_MESSAGES: Record<ValidationCode, string> = {
  invalid_path: "Path can only contain lower-case letters, numbers, '-', '.', '_', '~' and '/'.",
  path_too_long: `Path must be at most ${LIMITS.path} characters.`,
  title_required: "Title is required.",
  title_too_long: `Title must be at most ${LIMITS.title} characters.`,
  body_too_long: `Body must be at most ${LIMITS.body} characters.`,
  invalid_id: "That page reference is not valid.",
  not_found: "That page no longer exists.",
};

export const STATUS_MESSAGES = {
  saved: "Page saved.",
  deleted: "Page deleted.",
  published: "Site published.",
} as const;

export function lookup<T extends Record<string, string>>(map: T, key: string | undefined): string | null {
  return key !== undefined && Object.hasOwn(map, key) ? map[key as keyof T] : null;
}
