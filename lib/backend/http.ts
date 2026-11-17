import { backend, type Backend } from "./service";
import { settings } from "../harness";
import { ApiError, object } from "./validation";
import { locales, occupations, type Localized } from "./types";
import { messages } from "./messages";
const labels: Record<string, Localized> = {
  student: { "zh-CN": "学生", en: "Student", ja: "学生" },
  backend_developer: {
    "zh-CN": "后端开发者",
    en: "Backend developer",
    ja: "バックエンド開発者",
  },
  frontend_developer: {
    "zh-CN": "前端开发者",
    en: "Frontend developer",
    ja: "フロントエンド開発者",
  },
  fullstack_developer: {
    "zh-CN": "全栈开发者",
    en: "Fullstack developer",
    ja: "フルスタック開発者",
  },
  data_analyst: {
    "zh-CN": "数据分析师",
    en: "Data analyst",
    ja: "データアナリスト",
  },
  product_manager: {
    "zh-CN": "产品经理",
    en: "Product manager",
    ja: "プロダクトマネージャー",
  },
  tech_hobbyist: {
    "zh-CN": "技术爱好者",
    en: "Tech hobbyist",
    ja: "技術愛好家",
  },
  other: { "zh-CN": "其他", en: "Other", ja: "その他" },
};
function loopback(url: URL) {
  return (
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
    ["http:", "https:"].includes(url.protocol)
  );
}
async function body(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new ApiError("INVALID_INPUT", 415);
  // Bound actual bytes, including chunked requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("INVALID_INPUT");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 65536) {
      await reader.cancel();
      throw new ApiError("INVALID_INPUT", 413);
    }
    chunks.push(value);
  }
  try {
    return object(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch {
    throw new ApiError("INVALID_INPUT");
  }
}
export function createHandler(
  service: Backend,
  configured: () => Promise<boolean>,
) {
  return async (request: Request) => {
    const url = new URL(request.url),
      headers = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
    try {
      if (!loopback(url)) throw new ApiError("FORBIDDEN", 403);
      const origin = request.headers.get("origin");
      if (origin) {
        let valid = false;
        try {
          valid = loopback(new URL(origin));
        } catch {}
        if (!valid) throw new ApiError("FORBIDDEN", 403);
        headers.set("Access-Control-Allow-Origin", origin);
        headers.set(
          "Access-Control-Allow-Methods",
          "GET, PUT, PATCH, POST, DELETE, OPTIONS",
        );
        headers.set("Access-Control-Allow-Headers", "Content-Type");
      }
      if (request.method === "OPTIONS")
        return new Response(null, { status: 204, headers });
      const path = url.pathname.replace(/^\/api\/v1\//, "").replace(/\/$/, ""),
        method = request.method;
      let result: unknown,
        status = 200;
      if (path === "meta" && method === "GET") {
        result = {
          locales,
          occupations: occupations.map((value) => ({
            value,
            label: labels[value],
          })),
          sourceLanguages: ["en"],
          maxVideosPerDaily: 3,
          maxSubscriptions: 12,
          configured: await configured(),
        };
      } else if (path === "profile" && method === "GET")
        result = (await service.state()).profile;
      else if (path === "profile" && method === "PUT")
        result = await service.saveProfile(await body(request));
      else if (path === "preferences" && method === "PATCH")
        result = await service.saveProfile(await body(request), true);
      else if (path === "subscriptions" && method === "GET")
        result = (await service.state()).subscriptions;
      else if (path === "subscriptions" && method === "POST")
        result = await service.confirm(await body(request));
      else if (
        /^subscriptions\/(channels|videos)\/[^/]+$/.test(path) &&
        method === "DELETE"
      ) {
        const [, kind, id] = path.split("/");
        result = await service.removeSubscription(
          kind,
          id,
          (await body(request)).revision,
        );
      } else if (
        (path === "discoveries" || path === "daily") &&
        method === "POST"
      ) {
        const input = await body(request);
        if (!(await configured()))
          throw new ApiError("PROVIDER_NOT_CONFIGURED", 503);
        result =
          path === "daily"
            ? await service.startDaily(input)
            : await service.startDiscovery(input);
        status = 202;
      } else if (/^jobs\/[a-f0-9-]{36}$/.test(path) && method === "GET")
        result = await service.getJob(path.split("/")[1]);
      else if (path === "dashboard" && method === "GET")
        result = await service.dashboard();
      else throw new ApiError("NOT_FOUND", 404);
      return Response.json({ data: result }, { status, headers });
    } catch (e) {
      const error =
        e instanceof ApiError ? e : new ApiError("TASK_FAILED", 500);
      return Response.json(
        {
          error: {
            code: error.code,
            message: messages[error.code] ?? messages.TASK_FAILED,
            ...(error.field ? { field: error.field } : {}),
          },
        },
        { status: error.status, headers },
      );
    }
  };
}
export const handle = createHandler(backend, async () =>
  Boolean((await settings()).key),
);
