import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Backend } from "../lib/backend/service";
import { JsonStore } from "../lib/backend/store";
import { createHandler } from "../lib/backend/http";
import { localDate } from "../lib/backend/validation";
import { brief, type Dependencies } from "../lib/backend/intelligence";
import type { Clip, ProfileInput, Task } from "../lib/backend/types";
const roots: string[] = [];
afterEach(async () => {
  for (const dir of roots.splice(0))
    await rm(dir, { recursive: true, force: true });
});
const tr = (en: string) => ({
  "zh-CN": `中文：${en}`,
  en,
  ja: `日本語：${en}`,
});
const input: ProfileInput & { revision: number } = {
  revision: 0,
  name: "Test",
  occupation: "backend_developer",
  occupationOther: "",
  techStack: [{ id: "ts", name: "TypeScript" }],
  tasks: [{ id: "api", name: "Agent reliability", techStackIds: ["ts"] }],
  interest: "Reliable production agents",
  preferredCreators: "",
  excludedTopics: ["benchmarks"],
  outputLocale: "en",
  timeZone: "Asia/Tokyo",
};
const candidate = {
  id: "abcdefghijk",
  title: "Production agents",
  channelId: "UC" + "a".repeat(22),
  channel: "Example",
};
async function fixture(overrides: Partial<Dependencies> = {}) {
  const root = await mkdtemp(join(tmpdir(), "digest-backend-"));
  roots.push(root);
  const calls: string[] = [];
  const deps: Dependencies = {
    search: async () => [candidate],
    channelVideos: async () => [candidate],
    download: async () => {
      calls.push("download");
      return { duration: 90, files: ["a.timestamped.txt"] };
    },
    transcript: async () =>
      "[00:00:00] Production agents require validation.\n[00:00:40] Use evals and budget limits.\n[00:01:20] Review the outcome.",
    agent: async (role, request: any) => {
      calls.push(role);
      if (role === "channel-discovery")
        return request.task.includes("one concise")
          ? { query: "reliable agents" }
          : {
              videos: [
                {
                  id: candidate.id,
                  title: tr("Production agents"),
                  reason: tr("Matches your API task"),
                  relevance: 90,
                },
              ],
            };
      if (role === "video-acquisition")
        return {
          videoIds: request.candidates.map((v: any) => v.id).slice(0, 3),
        };
      if (role === "daily-briefing")
        return {
          summary: tr("Validate agent output"),
          takeaways: [
            {
              text: tr("Use evals"),
              sources: [{ videoId: candidate.id, chapterId: null }],
            },
          ],
        };
      if (request.segments)
        return {
          summary: "Agents require evals and budgets.",
          highlights: [
            {
              startSegmentId: request.segments[0].id,
              endSegmentId: request.segments[0].id,
              title: tr("Validation"),
              reason: tr("Relevant to API work"),
            },
          ],
        };
      return {
        title: tr("Production agents"),
        summary: tr("Agents require evals and budgets."),
        reason: tr("API reliability"),
        relevance: 90,
      };
    },
    ...overrides,
  };
  const store = new JsonStore(join(root, "state.json"));
  const backend = new Backend(
    store,
    deps,
    new Set(),
    () => new Date("2026-11-17T16:00:00Z"),
  );
  return { backend, store, calls, deps };
}
async function completed(backend: Backend, task: Task) {
  for (let n = 0; n < 200; n++) {
    const result = await backend.getJob(task.id);
    if (result.job.status !== "running" && !backend.active.has(task.id))
      return result;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("Test task timed out");
}
async function subscribed(backend: Backend) {
  await backend.saveProfile(input);
  const d = await completed(
    backend,
    await backend.startDiscovery({ query: "production" }),
  );
  expect(d.job.status).toBe("done");
  await backend.confirm({
    revision: 0,
    discoveryId: d.job.id,
    channelIds: [],
    videoIds: [candidate.id],
  });
  return d;
}
describe("profiles and preference snapshots", () => {
  test("validates task-stack links and other occupation", async () => {
    const { backend } = await fixture();
    await expect(
      backend.saveProfile({
        ...input,
        tasks: [{ id: "x", name: "x", techStackIds: ["missing"] }],
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      backend.saveProfile({ ...input, occupation: "other" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const p = await backend.saveProfile(input);
    expect(p.preferenceVersion).toBe(1);
    const changedLocale = await backend.saveProfile(
      { revision: 1, outputLocale: "ja" },
      true,
    );
    expect(changedLocale.preferenceVersion).toBe(1);
    expect(changedLocale.revision).toBe(2);
    await expect(
      backend.saveProfile({ revision: 1, interest: "new" }, true),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });
  test("serializes concurrent edits without lost updates and persists restart", async () => {
    const { backend, store } = await fixture();
    await backend.saveProfile(input);
    const results = await Promise.allSettled([
      backend.saveProfile({ revision: 1, interest: "Rust" }, true),
      backend.saveProfile({ revision: 1, interest: "Go" }, true),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const restarted = new Backend(
      new JsonStore(store.path),
      undefined,
      new Set(),
    );
    expect((await restarted.state()).profile?.revision).toBe(2);
  });
  test("temporary discovery preserves preferences; stale/forged confirmation rejected", async () => {
    const { backend } = await fixture();
    await backend.saveProfile(input);
    const task = await completed(
      backend,
      await backend.startDiscovery({ query: "temporary query" }),
    );
    expect((await backend.state()).profile?.interest).toBe(input.interest);
    await expect(
      backend.confirm({
        revision: 0,
        discoveryId: task.job.id,
        channelIds: ["forged"],
        videoIds: [],
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await backend.saveProfile({ revision: 1, interest: "new topic" }, true);
    await expect(
      backend.confirm({
        revision: 0,
        discoveryId: task.job.id,
        channelIds: [],
        videoIds: [candidate.id],
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });
});
describe("daily pipeline", () => {
  test("latest failed refresh can retry instead of returning an older success", async () => {
    const { backend, deps } = await fixture();
    await subscribed(backend);
    const original = await completed(backend, await backend.startDaily({}));
    const agent = deps.agent;
    deps.agent = async () => {
      throw new Error("provider offline");
    };
    const failed = await completed(
      backend,
      await backend.startDaily({ refresh: true }),
    );
    expect(failed.job.status).toBe("error");
    deps.agent = agent;
    const retry = await backend.startDaily({});
    expect(retry.id).not.toBe(original.job.id);
    expect(retry.id).not.toBe(failed.job.id);
    expect((await completed(backend, retry)).job.status).toBe("done");
  });
  test("briefing failure preserves usable clips with an accurate translated message", async () => {
    const { backend, deps } = await fixture();
    await subscribed(backend);
    const agent = deps.agent;
    deps.agent = async (role, input) => {
      if (role === "daily-briefing") throw new Error("provider offline");
      return agent(role, input);
    };
    expect(
      (await completed(backend, await backend.startDaily({}))).job.status,
    ).toBe("partial");
    const daily = (await backend.dashboard()).daily!;
    expect(daily.clips).toHaveLength(1);
    expect(daily.briefing.summary.en).toContain("Videos were analyzed");
    expect(daily.failures[0].code).toBe("BRIEFING_FAILED");
  });
  test("stores all translations, citations and source-based durations; deduplicates simultaneous refresh", async () => {
    const { backend, calls } = await fixture();
    await subscribed(backend);
    const [a, b] = await Promise.all([
      backend.startDaily({}),
      backend.startDaily({}),
    ]);
    expect(a.id).toBe(b.id);
    const result = await completed(backend, a);
    expect(result.job.status).toBe("done");
    const daily = (await backend.dashboard()).daily!;
    expect(daily.date).toBe("2026-11-18");
    expect(daily.clips[0].summary.ja).toBeTruthy();
    expect(daily.clips[0].title["zh-CN"]).toBeTruthy();
    expect(daily.clips[0].chapters[0]).toMatchObject({
      startSeconds: 0,
      endSeconds: 40,
      durationSeconds: 40,
    });
    expect(daily.briefing.takeaways[0].sources[0].videoId).toBe(candidate.id);
    expect(calls.filter((v) => v === "download")).toHaveLength(1);
    expect((await backend.startDaily({})).id).toBe(a.id);
    const count = calls.filter((v) => v === "highlight-analysis").length;
    await completed(backend, await backend.startDaily({ refresh: true }));
    expect(calls.filter((v) => v === "highlight-analysis")).toHaveLength(count);
    await backend.saveProfile({ revision: 1, outputLocale: "ja" }, true);
    expect((await backend.dashboard()).daily).not.toBeNull();
    await backend.saveProfile(
      { revision: 2, excludedTopics: ["agents"] },
      true,
    );
    expect((await backend.dashboard()).daily).toBeNull();
  });
  test("partial acquisition retains successful multilingual clips", async () => {
    const { backend, deps } = await fixture();
    await subscribed(backend);
    const second = { ...candidate, id: "zyxwvutsrqp" };
    await backend.store.update((s) => {
      s.subscriptions.videos.push({
        ...second,
        titleI18n: tr("Second"),
        reason: tr("Reason"),
        relevance: 80,
      });
    });
    const download = deps.download;
    deps.download = async (id) => {
      if (id === second.id) throw new Error("network failure");
      return download(id);
    };
    const result = await completed(backend, await backend.startDaily({}));
    expect(result.job.status).toBe("partial");
    const daily = (await backend.dashboard()).daily!;
    expect(daily.clips).toHaveLength(1);
    expect(daily.failures[0].sourceId).toBe(second.id);
  });
  test("missing language prevents publication of incomplete analysis", async () => {
    const { backend, deps } = await fixture();
    await subscribed(backend);
    const agent = deps.agent;
    deps.agent = async (role, req: any) => {
      const value = await agent(role, req);
      if (role === "highlight-analysis" && !req.segments)
        delete value.summary.ja;
      return value;
    };
    const result = await completed(backend, await backend.startDaily({}));
    expect(result.job.status).toBe("error");
    expect((await backend.dashboard()).daily?.clips).toHaveLength(0);
  });
  test("briefing rejects citations to unknown videos or chapters", async () => {
    const { backend, deps } = await fixture();
    await subscribed(backend);
    await completed(backend, await backend.startDaily({}));
    const clips = (await backend.dashboard()).daily!.clips;
    for (const source of [
      { videoId: "invented", chapterId: null },
      { videoId: candidate.id, chapterId: "invented" },
    ]) {
      const bad = {
        ...deps,
        agent: async () => ({
          summary: tr("Summary"),
          takeaways: [{ text: tr("Claim"), sources: [source] }],
        }),
      };
      await expect(brief(clips, bad)).rejects.toMatchObject({
        code: "INVALID_MODEL_OUTPUT",
      });
    }
  });
  test("does not process subscriptions before explicit confirmation", async () => {
    const { backend, calls } = await fixture();
    await backend.saveProfile(input);
    await completed(backend, await backend.startDiscovery({}));
    await expect(backend.startDaily({})).rejects.toMatchObject({
      code: "SELECTION_REQUIRED",
    });
    expect(calls).not.toContain("download");
  });
});
describe("storage and HTTP boundary", () => {
  test("restart exposes interrupted tasks as errors", async () => {
    const { backend, store } = await fixture();
    await store.update((s) => {
      s.jobs.test = {
        id: "test",
        kind: "daily",
        status: "running",
        stage: "analyzing",
        createdAt: "x",
        updatedAt: "x",
      };
    });
    expect((await backend.getJob("test")).job.error?.code).toBe("INTERRUPTED");
  });
  test("corrupted state is not silently overwritten", async () => {
    const { backend, store } = await fixture();
    await writeFile(store.path, "{bad");
    await expect(backend.saveProfile(input)).rejects.toThrow();
  });
  test("failed initial persistence releases active lock", async () => {
    const { backend, store } = await fixture();
    await backend.saveProfile(input);
    const original = store.update.bind(store);
    store.update = async (fn) => {
      await store.read().then(fn);
      throw new Error("disk full");
    };
    await expect(backend.startDiscovery({})).rejects.toThrow("disk full");
    expect(backend.active.size).toBe(0);
    store.update = original;
    expect(
      (await completed(backend, await backend.startDiscovery({}))).job.status,
    ).toBe("done");
  });
  test("serves multilingual errors; allows local frontend and rejects remote origin/malformed JSON", async () => {
    const { backend } = await fixture(),
      handle = createHandler(backend, async () => true);
    const request = (path: string, init?: RequestInit) =>
      new Request(`http://localhost:3210/api/v1/${path}`, init);
    const cors = await handle(
      request("meta", { headers: { Origin: "http://localhost:5173" } }),
    );
    expect(cors.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:5173",
    );
    expect(
      (
        await handle(
          request("meta", { headers: { Origin: "https://evil.example" } }),
        )
      ).status,
    ).toBe(403);
    const bad = await handle(
      request("profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.message.ja).toBeTruthy();
    const large = await handle(
      request("profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x: "x".repeat(66000) }),
      }),
    );
    expect(large.status).toBe(413);
  });
  test("computes calendar date in explicit timezone, including day boundaries", () => {
    const time = new Date("2026-11-17T16:00:00Z");
    expect(localDate(time, "Asia/Tokyo")).toBe("2026-11-18");
    expect(localDate(time, "America/Los_Angeles")).toBe("2026-11-17");
  });
});
