import { writeFile } from "node:fs/promises";
import { locales, occupations } from "../lib/backend/types";
type Schema = Record<string, unknown>;
const str: Schema = { type: "string" },
  num: Schema = { type: "number" },
  int: Schema = { type: "integer", minimum: 0 };
const ref = (name: string): Schema => ({
  $ref: `#/components/schemas/${name}`,
});
const arr = (items: Schema): Schema => ({ type: "array", items });
const obj = (
  properties: Record<string, Schema>,
  required = Object.keys(properties),
): Schema => ({ type: "object", properties, required });
const nullable = (schema: Schema): Schema => ({
  anyOf: [schema, { type: "null" }],
});
const profileFields = {
  name: { type: "string", minLength: 1, maxLength: 120 },
  occupation: { type: "string", enum: occupations },
  occupationOther: { type: "string", maxLength: 200 },
  techStack: arr(obj({ id: str, name: str })),
  tasks: arr(obj({ id: str, name: str, techStackIds: arr(str) })),
  interest: { type: "string", minLength: 1, maxLength: 1500 },
  preferredCreators: str,
  excludedTopics: arr(str),
  outputLocale: { type: "string", enum: locales },
  timeZone: str,
};
const candidateFields = {
  id: str,
  title: str,
  channelId: str,
  channel: str,
  description: str,
  duration: num,
  titleI18n: ref("Localized"),
  reason: ref("Localized"),
  relevance: int,
};
const schemas: Record<string, Schema> = {
  Localized: obj(
    Object.fromEntries(
      locales.map((l) => [l, { type: "string", minLength: 1 }]),
    ),
  ),
  ProfileInput: obj({ revision: int, ...profileFields }, [
    "revision",
    "name",
    "occupation",
    "techStack",
    "tasks",
    "interest",
    "outputLocale",
    "timeZone",
  ]),
  Profile: obj({
    ...profileFields,
    revision: int,
    preferenceVersion: int,
    updatedAt: str,
  }),
  PreferenceUpdate: obj(
    {
      revision: int,
      ...Object.fromEntries(
        Object.entries(profileFields).filter(
          ([k]) => !["name", "occupation", "occupationOther"].includes(k),
        ),
      ),
    },
    ["revision"],
  ),
  RecommendedChannel: obj({
    id: str,
    name: str,
    url: str,
    reason: ref("Localized"),
  }),
  RecommendedVideo: obj(
    candidateFields,
    Object.keys(candidateFields).filter(
      (k) => !["description", "duration"].includes(k),
    ),
  ),
  Discovery: obj({
    id: str,
    preferenceVersion: int,
    query: str,
    createdAt: str,
    channels: arr(ref("RecommendedChannel")),
    videos: arr(ref("RecommendedVideo")),
  }),
  Subscriptions: obj({
    revision: int,
    channels: arr(ref("RecommendedChannel")),
    videos: arr(ref("RecommendedVideo")),
  }),
  Confirmation: obj({
    revision: int,
    discoveryId: str,
    channelIds: arr(str),
    videoIds: arr(str),
  }),
  Chapter: obj({
    id: str,
    title: ref("Localized"),
    reason: ref("Localized"),
    startSeconds: num,
    endSeconds: num,
    durationSeconds: num,
    evidence: str,
  }),
  Clip: obj({
    videoId: str,
    channelId: str,
    channel: str,
    originalTitle: str,
    title: ref("Localized"),
    summary: ref("Localized"),
    reason: ref("Localized"),
    relevance: int,
    url: str,
    mediaUrl: str,
    durationSeconds: num,
    chapters: arr(ref("Chapter")),
  }),
  Failure: obj({ sourceId: str, code: str, message: ref("Localized") }),
  Briefing: obj({
    summary: ref("Localized"),
    takeaways: arr(
      obj({
        text: ref("Localized"),
        sources: arr(obj({ videoId: str, chapterId: nullable(str) })),
      }),
    ),
  }),
  Daily: obj({
    id: str,
    date: str,
    timeZone: str,
    preferenceVersion: int,
    subscriptionRevision: int,
    generatedAt: str,
    clips: arr(ref("Clip")),
    briefing: ref("Briefing"),
    failures: arr(ref("Failure")),
  }),
  Task: obj(
    {
      id: str,
      kind: { enum: ["discovery", "daily"] },
      status: { enum: ["running", "done", "partial", "error"] },
      stage: {
        enum: [
          "searching",
          "downloading",
          "analyzing",
          "briefing",
          "complete",
          "failed",
        ],
      },
      createdAt: str,
      updatedAt: str,
      resultId: str,
      cacheKey: str,
      error: ref("Failure"),
    },
    ["id", "kind", "status", "stage", "createdAt", "updatedAt"],
  ),
  JobResponse: obj({
    job: ref("Task"),
    result: { anyOf: [ref("Discovery"), ref("Daily"), { type: "null" }] },
  }),
  Dashboard: obj({
    date: str,
    timeZone: str,
    preferenceVersion: int,
    subscriptionRevision: int,
    daily: nullable(ref("Daily")),
  }),
  Meta: obj({
    locales: arr(str),
    occupations: arr(obj({ value: str, label: ref("Localized") })),
    sourceLanguages: arr(str),
    maxVideosPerDaily: int,
    maxSubscriptions: int,
    configured: { type: "boolean" },
  }),
  Error: obj({
    error: obj({ code: str, message: ref("Localized"), field: str }, [
      "code",
      "message",
    ]),
  }),
};
const json = (schema: Schema) => ({ "application/json": { schema } });
const operation = (
  operationId: string,
  output: Schema,
  input?: Schema,
  accepted = false,
  parameters?: unknown[],
) => ({
  operationId,
  ...(input ? { requestBody: { required: true, content: json(input) } } : {}),
  ...(parameters ? { parameters } : {}),
  responses: {
    [accepted ? "202" : "200"]: {
      description: accepted ? "Poll returned job ID for completion" : "Success",
      content: json(obj({ data: output })),
    },
    default: {
      description: "Error; HTTP 400/403/404/409/413/415/500/503",
      content: json(ref("Error")),
    },
  },
});
const idParam = { name: "id", in: "path", required: true, schema: str };
const paths = {
  "/meta": { get: operation("getMeta", ref("Meta")) },
  "/profile": {
    get: operation("getProfile", nullable(ref("Profile"))),
    put: operation("saveProfile", ref("Profile"), ref("ProfileInput")),
  },
  "/preferences": {
    patch: operation(
      "updatePreferences",
      ref("Profile"),
      ref("PreferenceUpdate"),
    ),
  },
  "/discoveries": {
    post: operation("discover", ref("Task"), obj({ query: str }, []), true),
  },
  "/jobs/{id}": {
    get: operation("getJob", ref("JobResponse"), undefined, false, [idParam]),
  },
  "/subscriptions": {
    get: operation("getSubscriptions", ref("Subscriptions")),
    post: operation(
      "confirmRecommendations",
      ref("Subscriptions"),
      ref("Confirmation"),
    ),
  },
  "/subscriptions/{kind}/{id}": {
    delete: operation(
      "removeSubscription",
      ref("Subscriptions"),
      obj({ revision: int }),
      false,
      [
        {
          name: "kind",
          in: "path",
          required: true,
          schema: { type: "string", enum: ["channels", "videos"] },
        },
        idParam,
      ],
    ),
  },
  "/daily": {
    post: operation(
      "generateDaily",
      ref("Task"),
      obj({ refresh: { type: "boolean" } }, []),
      true,
    ),
  },
  "/dashboard": { get: operation("getDashboard", ref("Dashboard")) },
};
await writeFile(
  "docs/backend-api/openapi.json",
  JSON.stringify(
    {
      openapi: "3.1.0",
      info: {
        title: "Channel Digest localhost backend",
        version: "1.0.0",
        description:
          "Single local profile. All generated display text is stored in zh-CN, en, ja. See docs/backend-api/README.md for lifecycle, limits and recovery.",
      },
      servers: [{ url: "http://localhost:3210/api/v1" }],
      paths,
      components: { schemas },
    },
    null,
    2,
  ) + "\n",
);
