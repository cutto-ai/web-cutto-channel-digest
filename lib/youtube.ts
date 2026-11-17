import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, isAbsolute } from "node:path";
import { settings } from "./harness";

export function command(
  exe: string,
  args: string[],
  timeout = 90000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      env: {
        NODE_ENV: process.env.NODE_ENV,
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        LANG: process.env.LANG,
      },
    });
    let stdout = "",
      stderr = "",
      settled = false;
    const kill = () => {
      try {
        if (child.pid) process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    };
    const timer = setTimeout(() => {
      kill();
      finish(new Error("下载或搜索超时，请重试。"));
    }, timeout);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(stdout);
    };
    child.stdout.on("data", (v) => {
      stdout += v;
      if (stdout.length > 20_000_000) {
        kill();
        finish(new Error("工具输出超过大小限制。"));
      }
    });
    child.stderr.on("data", (v) => {
      stderr = (stderr + v).slice(-6000);
    });
    child.on("error", (e) => finish(e));
    child.on("close", (code) =>
      finish(
        code === 0 ? undefined : new Error(stderr.trim() || "工具执行失败。"),
      ),
    );
  });
}
const args = [
  "--ignore-config",
  "--flat-playlist",
  "--dump-single-json",
  "--skip-download",
  "--socket-timeout",
  "15",
  "--retries",
  "1",
];
export async function searchVideos(query: string) {
  const data = JSON.parse(
    await command("yt-dlp", [
      ...args,
      "--",
      `ytsearch12:${query.slice(0, 200)}`,
    ]),
  );
  return (data.entries ?? [])
    .filter(
      (v: any) =>
        /^[\w-]{11}$/.test(v.id) && /^UC[\w-]{22}$/.test(v.channel_id ?? ""),
    )
    .map((v: any) => ({
      id: v.id,
      title: v.title,
      channelId: v.channel_id,
      channel: v.channel,
      description: String(v.description ?? "").slice(0, 1000),
      duration: v.duration,
    }));
}
export async function channelVideos(id: string) {
  if (!/^UC[\w-]{22}$/.test(id)) throw new Error("频道 ID 无效。");
  const data = JSON.parse(
    await command("yt-dlp", [
      ...args,
      "--playlist-end",
      "6",
      "--",
      `https://www.youtube.com/channel/${id}/videos`,
    ]),
  );
  return (data.entries ?? [])
    .filter((v: any) => /^[\w-]{11}$/.test(v.id) && !v.is_live)
    .map((v: any) => ({ id: v.id, title: v.title, duration: v.duration }));
}
export async function downloadVideo(id: string) {
  if (!/^[\w-]{11}$/.test(id)) throw new Error("视频 ID 无效。");
  const root = resolve(".data/media", id);
  const receipt = resolve(root, "receipt.json");
  try {
    const cached = JSON.parse(await readFile(receipt, "utf8"));
    await readFile(
      cached.files.find((p: string) => p.endsWith(".timestamped.txt")),
    );
    return cached;
  } catch {}
  const { script } = await settings();
  if (!script || !isAbsolute(script))
    throw new Error("请配置 YOUTUBE_DOWNLOAD_SCRIPT 的绝对路径。");
  await mkdir(root, { recursive: true });
  const output = await command(
    "bun",
    [script, `https://www.youtube.com/watch?v=${id}`, root],
    12 * 60 * 1000,
  );
  const start = output.lastIndexOf("\n{");
  const result = JSON.parse(output.slice(start < 0 ? 0 : start + 1));
  if (!Array.isArray(result.files) || result.files.length !== 3)
    throw new Error("下载 Skill 未返回完整文件。");
  await writeFile(receipt, JSON.stringify(result, null, 2));
  return result;
}
