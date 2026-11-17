"use client";
import { useEffect, useRef, useState } from "react";
import type { Job, Video } from "@/lib/contracts";
const time = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const ideas = [
  "AI Agent 的真实部署经验与成本",
  "科学解释：宇宙、黑洞和太空探索",
  "独立开发者怎样找到第一批用户",
];
function VideoCard({ video }: { video: Video }) {
  const player = useRef<HTMLVideoElement>(null);
  return (
    <article className="video-card">
      <div className="video-heading">
        <span className="eyebrow">{video.channel}</span>
        <a href={video.url} target="_blank" rel="noreferrer">
          YouTube ↗
        </a>
      </div>
      <h2>{video.title}</h2>
      {video.mediaReady && (
        <video
          ref={player}
          controls
          preload="metadata"
          src={`/api/media?id=${video.id}`}
        />
      )}
      <p className="summary">{video.summary || "正在准备视频与分析结果…"}</p>
      {video.subtitleSource && (
        <small>字幕来源：{video.subtitleSource} · 基于字幕分析</small>
      )}
      {video.error && <div className="error">{video.error}</div>}
      <div className="highlights">
        {video.highlights.map((h, i) => (
          <div className="highlight" key={`${h.start}-${i}`}>
            <button
              className="timestamp"
              onClick={() => {
                if (player.current) {
                  player.current.currentTime = h.start;
                  void player.current.play().catch(() => {});
                }
              }}
            >
              ▶ {time(h.start)}–{time(h.end)}
            </button>
            <div>
              <h3>{h.title}</h3>
              <p>{h.reason}</p>
              <details>
                <summary>查看字幕依据</summary>
                <blockquote>{h.evidence}</blockquote>
              </details>
            </div>
          </div>
        ))}
      </div>
      {video.summary && !video.highlights.length && (
        <p className="empty">
          这段视频中没有找到足够相关的片段。你可以修改兴趣，再试一次。
        </p>
      )}
    </article>
  );
}
export default function Home() {
  const [interest, setInterest] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [config, setConfig] = useState<{
    configured: boolean;
    model: string;
    provider: string;
  } | null>(null);
  const [showLog, setShowLog] = useState(true);
  useEffect(() => {
    const refresh = () =>
      fetch("/api/jobs")
        .then((r) => r.json())
        .then(setConfig)
        .catch(() => {});
    refresh();
    const id = setInterval(refresh, 5000);
    const saved = localStorage.getItem("digest-job");
    if (saved)
      fetch(`/api/jobs?id=${saved}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (j) {
            setJob(j);
            setInterest(j.interest);
          }
        })
        .catch(() => {});
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!job || ["done", "error", "confirm"].includes(job.status)) return;
    const id = setInterval(() => {
      fetch(`/api/jobs?id=${job.id}`)
        .then((r) => r.json())
        .then((j) => {
          if (j.id) setJob(j);
        })
        .catch(() => {});
    }, 1500);
    return () => clearInterval(id);
  }, [job?.id, job?.status]);
  useEffect(() => {
    if (job?.status === "confirm")
      setSelected(job.channels.slice(0, 1).map((c) => c.id));
  }, [job?.id, job?.status]);
  async function send(body: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setJob(data);
      localStorage.setItem("digest-job", data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "请求失败");
    } finally {
      setBusy(false);
    }
  }
  const running =
    job && ["discovering", "downloading", "analyzing"].includes(job.status);
  const stage = !job
    ? 0
    : job.status === "discovering"
      ? 1
      : job.status === "confirm"
        ? 2
        : job.status === "downloading"
          ? 3
          : 4;
  return (
    <>
      <nav>
        <a className="brand" href="/">
          <span className="logo">◒</span> channel<span>digest</span>
        </a>
        <div className="nav-meta">
          <span className="live-dot" /> LOCAL DEMO{" "}
          <span className="divider">/</span> Powered by DeepSeek Harness
        </div>
      </nav>
      <main>
        <section className="hero">
          <div className="eyebrow">LESS SCROLLING. MORE DISCOVERY.</div>
          <h1>
            Follow your curiosity.
            <br />
            <span>Find the moments that matter.</span>
          </h1>
          <p>
            告诉我们你真正想了解什么。三个 Agent 为你发现频道、获取视频，
            <br className="desktop" />
            再把长视频里值得看的片段交给你。
          </p>
        </section>
        <section className="composer">
          <div className="composer-top">
            <span className="spark">✦</span>
            <label htmlFor="interest">你最近对什么感兴趣？</label>
            <span className="private">仅本机运行</span>
          </div>
          <textarea
            id="interest"
            value={interest}
            onChange={(e) => setInterest(e.target.value)}
            placeholder="例如：我在做一个 AI 产品，想看 Agent 的实际部署经验、踩坑和成本，不想看模型跑分。"
            maxLength={1500}
            disabled={Boolean(running)}
          />
          <div className="composer-bottom">
            <span>说出目标，比只写关键词更有用。</span>
            <button
              className="primary"
              disabled={busy || Boolean(running) || interest.trim().length < 3}
              onClick={() => void send({ interest })}
            >
              {busy ? "提交中…" : running ? "Agent 正在工作…" : "发现我的频道"}{" "}
              <span>↗</span>
            </button>
          </div>
        </section>
        <div className="ideas">
          <span>试试这些兴趣</span>
          {ideas.map((x) => (
            <button
              key={x}
              disabled={Boolean(running)}
              onClick={() => setInterest(x)}
            >
              {x} ↗
            </button>
          ))}
        </div>
        {config && !config.configured && (
          <div className="setup">
            <strong>还差一步：配置模型密钥</strong>
            <p>
              在本项目的 <code>.env.local</code> 中填入{" "}
              <code>PROVIDER_API_KEY</code>
              。密钥只由本机后端读取。保存后页面会自动识别。
            </p>
          </div>
        )}
        {error && <div className="error">{error}</div>}
        <section className="pipeline">
          {[
            { n: "01", title: "发现频道", text: "理解兴趣 · 推荐 3 个频道" },
            { n: "02", title: "由你确认", text: "选择想关注的频道" },
            { n: "03", title: "获取内容", text: "选择视频 · 下载原片与字幕" },
            { n: "04", title: "找到精彩片段", text: "兴趣匹配 · 真实时间码" },
          ].map((s, i) => (
            <div
              key={s.n}
              className={`step ${stage === i + 1 ? "active" : ""} ${stage > i + 1 ? "complete" : ""}`}
            >
              <span className="step-num">{s.n}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            </div>
          ))}
        </section>
        {job && (
          <section className="workspace">
            <div className="section-heading">
              <div>
                <span className="eyebrow">YOUR DISCOVERY</span>
                <h2>
                  {job.status === "confirm"
                    ? "这几个频道，值得你看看。"
                    : job.status === "done"
                      ? "为你找到的观看清单。"
                      : job.status === "error"
                        ? "本次处理遇到了问题。"
                        : "三个 Agent，正在为你工作。"}
                </h2>
              </div>
              <span className={`status ${running ? "working" : ""}`}>
                {running ? "◌ " : ""}
                {job.status === "done"
                  ? "已完成"
                  : job.status === "confirm"
                    ? "等待你的选择"
                    : job.status === "error"
                      ? "需要重试"
                      : "处理中"}
              </span>
            </div>
            <p className="job-message">{job.message}</p>
            {job.channels.length > 0 && (
              <>
                <div className="channels">
                  {job.channels.map((c, i) => (
                    <article
                      className={`channel ${selected.includes(c.id) ? "selected" : ""}`}
                      key={c.id}
                    >
                      <div className="channel-top">
                        <span className="channel-avatar">
                          {c.name?.slice(0, 1) || "Y"}
                        </span>
                        <span className="rank">MATCH 0{i + 1}</span>
                        {job.status === "confirm" && (
                          <input
                            aria-label={`选择 ${c.name}`}
                            type="checkbox"
                            checked={selected.includes(c.id)}
                            onChange={(e) =>
                              setSelected(
                                e.target.checked
                                  ? [...selected, c.id]
                                  : selected.filter((id) => id !== c.id),
                              )
                            }
                          />
                        )}
                      </div>
                      <h3>
                        <a href={c.url} target="_blank" rel="noreferrer">
                          {c.name} ↗
                        </a>
                      </h3>
                      <p>{c.reason}</p>
                      <div className="examples">
                        <span>相关内容</span>
                        {c.examples.slice(0, 2).map((v) => (
                          <a
                            key={v.id}
                            href={`https://www.youtube.com/watch?v=${v.id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            ▷ {v.title}
                          </a>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
                {job.status === "confirm" && (
                  <div className="confirm-bar">
                    <p>
                      已选 {selected.length} 个频道 · 每个频道处理 1 个视频
                      <br />
                      <small>
                        首次下载 1080p 视频可能需要数分钟。建议先选 1 个频道。
                      </small>
                    </p>
                    <button
                      className="primary"
                      disabled={busy || !selected.length}
                      onClick={() =>
                        void send({
                          action: "confirm",
                          id: job.id,
                          channelIds: selected,
                        })
                      }
                    >
                      确认添加并分析 →
                    </button>
                  </div>
                )}
              </>
            )}
            {job.videos.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
            {job.error && <div className="error">{job.error}</div>}
            <div className="activity">
              <button
                className="activity-toggle"
                onClick={() => setShowLog(!showLog)}
              >
                Agent 活动记录 <span>{showLog ? "−" : "+"}</span>
              </button>
              {showLog && (
                <ol>
                  {job.events.map((e, i) => (
                    <li key={i}>
                      <time>
                        {new Date(e.time).toLocaleTimeString("zh-CN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </time>
                      <strong>{e.agent}</strong>
                      <span>{e.text}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        )}
        <footer>
          <span>Built for curiosity, not endless feeds.</span>
          <span>
            {config?.model ?? "gpt-6.1-sol"} · OpenAI Responses · localhost
          </span>
        </footer>
      </main>
    </>
  );
}
