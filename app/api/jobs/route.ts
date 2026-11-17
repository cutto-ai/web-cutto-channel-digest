import { createJob, getJob, confirmJob } from "@/lib/jobs";
import { settings } from "@/lib/harness";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (id) return Response.json(await getJob(id));
    const c = await settings();
    return Response.json({
      configured: Boolean(c.key),
      model: c.model,
      provider: c.baseURL,
      protocol: "OpenAI Responses",
    });
  } catch {
    return Response.json({ error: "任务不存在。" }, { status: 404 });
  }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== request.headers.get("host"))
      return Response.json({ error: "仅允许本机页面请求。" }, { status: 403 });
    const body = await request.json();
    if (body.action === "confirm") {
      if (
        typeof body.id !== "string" ||
        !Array.isArray(body.channelIds) ||
        body.channelIds.some((v: unknown) => typeof v !== "string")
      )
        throw new Error("确认参数无效。");
      return Response.json(await confirmJob(body.id, body.channelIds));
    }
    if (
      typeof body.interest !== "string" ||
      body.interest.trim().length < 3 ||
      body.interest.length > 1500
    )
      throw new Error("请输入 3–1500 个字符的兴趣描述。");
    if (!(await settings()).key)
      throw new Error("请先在 .env.local 填写 PROVIDER_API_KEY。");
    return Response.json(await createJob(body.interest.trim()));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "请求失败。" },
      { status: 400 },
    );
  }
}
