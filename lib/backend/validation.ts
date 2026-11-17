import {
  locales,
  occupations,
  type Localized,
  type ProfileInput,
} from "./types";
export class ApiError extends Error {
  constructor(
    public code: string,
    public status = 400,
    public field?: string,
  ) {
    super(code);
  }
}
export function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApiError("INVALID_INPUT");
  return value as Record<string, any>;
}
export function text(
  value: unknown,
  field: string,
  max = 1500,
  allowEmpty = false,
): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!allowEmpty && !value.trim())
  )
    throw new ApiError("INVALID_INPUT", 400, field);
  return value.trim();
}
export function list(value: unknown, field: string, max = 30): any[] {
  if (!Array.isArray(value) || value.length > max)
    throw new ApiError("INVALID_INPUT", 400, field);
  return value;
}
export function ids(value: unknown, field: string, max = 30): string[] {
  const result = list(value, field, max).map((v) => text(v, field, 80));
  if (new Set(result).size !== result.length)
    throw new ApiError("INVALID_INPUT", 400, field);
  return result;
}
export function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new ApiError("INVALID_INPUT", 400, "revision");
  return value as number;
}
export function localized(value: unknown): Localized {
  const v = object(value);
  return Object.fromEntries(
    locales.map((l) => [l, text(v[l], l, 12000)]),
  ) as Localized;
}
export function relevance(value: unknown): number {
  if (
    !Number.isInteger(value) ||
    (value as number) < 0 ||
    (value as number) > 100
  )
    throw new ApiError("INVALID_MODEL_OUTPUT", 502);
  return value as number;
}
export function profileInput(value: unknown): ProfileInput {
  const v = object(value);
  if (!occupations.includes(v.occupation))
    throw new ApiError("INVALID_INPUT", 400, "occupation");
  if (!locales.includes(v.outputLocale))
    throw new ApiError("INVALID_INPUT", 400, "outputLocale");
  const timeZone = text(v.timeZone, "timeZone", 100);
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
  } catch {
    throw new ApiError("INVALID_INPUT", 400, "timeZone");
  }
  const techStack = list(v.techStack, "techStack").map((t) => ({
    id: text(object(t).id, "techStack.id", 80),
    name: text(t.name, "techStack.name", 120),
  }));
  const stackIds = new Set(techStack.map((t) => t.id));
  if (stackIds.size !== techStack.length)
    throw new ApiError("INVALID_INPUT", 400, "techStack.id");
  const tasks = list(v.tasks, "tasks").map((t) => ({
    id: text(object(t).id, "tasks.id", 80),
    name: text(t.name, "tasks.name", 500),
    techStackIds: ids(t.techStackIds, "tasks.techStackIds"),
  }));
  if (
    new Set(tasks.map((t) => t.id)).size !== tasks.length ||
    tasks.some((t) => t.techStackIds.some((id) => !stackIds.has(id)))
  )
    throw new ApiError("INVALID_INPUT", 400, "tasks.techStackIds");
  return {
    name: text(v.name, "name", 120),
    occupation: v.occupation,
    occupationOther: text(
      v.occupationOther ?? "",
      "occupationOther",
      200,
      v.occupation !== "other",
    ),
    techStack,
    tasks,
    interest: text(v.interest, "interest"),
    preferredCreators: text(
      v.preferredCreators ?? "",
      "preferredCreators",
      500,
      true,
    ),
    excludedTopics: ids(v.excludedTopics ?? [], "excludedTopics", 20),
    outputLocale: v.outputLocale,
    timeZone,
  };
}
export function preferenceContext(p: ProfileInput) {
  return {
    occupation: p.occupation,
    occupationOther: p.occupationOther,
    techStack: p.techStack,
    tasks: p.tasks,
    interest: p.interest,
    preferredCreators: p.preferredCreators,
    excludedTopics: p.excludedTopics,
  };
}
export function localDate(now: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
