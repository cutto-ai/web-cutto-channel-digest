import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { resolve, sep } from "node:path";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!/^[\w-]{11}$/.test(id))
      return new Response("Invalid video", { status: 400 });
    const root = resolve(".data/media", id);
    const receipt = JSON.parse(
      await readFile(resolve(root, "receipt.json"), "utf8"),
    );
    const file = receipt.files.find((p: string) => p.endsWith(".mp4"));
    if (!file || !resolve(file).startsWith(root + sep))
      throw new Error("Invalid path");
    const size = (await stat(file)).size;
    const range = request.headers.get("range");
    let start = 0,
      end = size - 1;
    if (range) {
      const m = range.match(/^bytes=(\d+)-(\d*)$/);
      if (!m)
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      start = Number(m[1]);
      end = m[2] ? Math.min(Number(m[2]), end) : end;
      if (start > end || start >= size)
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
    }
    const headers: Record<string, string> = {
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Content-Length": String(end - start + 1),
    };
    if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    return new Response(
      Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream,
      { status: range ? 206 : 200, headers },
    );
  } catch {
    return new Response("Video unavailable", { status: 404 });
  }
}
