export type Channel = {
  id: string;
  name: string;
  url: string;
  reason: string;
  examples: { id: string; title: string }[];
};
export type Segment = { id: number; start: number; end: number; text: string };
export type Highlight = {
  title: string;
  reason: string;
  start: number;
  end: number;
  evidence: string;
};
export type Video = {
  id: string;
  title: string;
  channel: string;
  url: string;
  summary: string;
  highlights: Highlight[];
  subtitleSource?: string;
  error?: string;
  mediaReady?: boolean;
};
export type Job = {
  id: string;
  interest: string;
  status:
    | "discovering"
    | "confirm"
    | "downloading"
    | "analyzing"
    | "done"
    | "error";
  message: string;
  channels: Channel[];
  videos: Video[];
  events: { time: string; agent: string; text: string }[];
  error?: string;
  createdAt: string;
};

export function parseJson(text: string): any {
  const clean = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(clean);
  } catch {
    throw new Error("Agent 未返回有效 JSON。请重试。");
  }
}
export function parseTranscript(text: string, duration: number): Segment[] {
  const rows = text.split(/\r?\n/).flatMap((line) => {
    const m = line.match(/^\[(\d+):(\d+):(\d+(?:\.\d+)?)\]\s*(.+)$/);
    return m
      ? [
          {
            start: Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]),
            text: m[4],
          },
        ]
      : [];
  });
  if (!rows.length || !Number.isFinite(duration) || duration <= 0)
    throw new Error("字幕没有有效时间戳。");
  const segments: Segment[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (
      row.start < 0 ||
      row.start >= duration ||
      (i > 0 && row.start < rows[i - 1].start)
    )
      throw new Error("字幕时间戳超出视频范围或顺序错误。");
    const end = Math.min(duration, rows[i + 1]?.start ?? duration);
    const last = segments.at(-1);
    if (last && end - last.start <= 45 && row.start - last.end <= 5) {
      last.text += " " + row.text;
      last.end = end;
    } else
      segments.push({
        id: segments.length,
        start: row.start,
        end,
        text: row.text,
      });
  }
  return segments.filter((s) => s.end > s.start);
}
export function validateHighlights(
  raw: unknown,
  segments: Segment[],
): Highlight[] {
  if (!Array.isArray(raw)) throw new Error("Agent 的片段列表无效。");
  return raw.slice(0, 5).map((h) => {
    if (
      !h ||
      !Number.isInteger(h.startSegmentId) ||
      !Number.isInteger(h.endSegmentId)
    )
      throw new Error("片段缺少有效字幕 ID。");
    const a = segments.find((s) => s.id === h.startSegmentId),
      b = segments.find((s) => s.id === h.endSegmentId);
    if (!a || !b || b.id < a.id || b.end - a.start > 240)
      throw new Error("Agent 选择了不存在或过长的片段。");
    if (typeof h.title !== "string" || typeof h.reason !== "string")
      throw new Error("片段缺少标题或推荐原因。");
    return {
      title: h.title,
      reason: h.reason,
      start: a.start,
      end: b.end,
      evidence: segments
        .filter((s) => s.id >= a.id && s.id <= b.id)
        .map((s) => s.text)
        .join(" "),
    };
  });
}
