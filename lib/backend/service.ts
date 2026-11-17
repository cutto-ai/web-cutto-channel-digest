import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { JsonStore } from "./store";
import {
  analyze,
  brief,
  chooseVideos,
  dependencies,
  discover,
  type Dependencies,
} from "./intelligence";
import {
  ApiError,
  ids,
  localDate,
  object,
  preferenceContext,
  profileInput,
  text,
  version,
} from "./validation";
import { emptyBriefing, messages } from "./messages";
import type {
  Candidate,
  Daily,
  Failure,
  Profile,
  State,
  Subscriptions,
  Task,
} from "./types";
const globals = globalThis as typeof globalThis & {
  digestActive?: Set<string>;
};
const sharedActive = (globals.digestActive ??= new Set<string>());
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const at = () => new Date().toISOString();
function record(s: State, name: string, jobId?: string) {
  s.events.push({
    id: randomUUID(),
    name,
    at: at(),
    jobId,
    preferenceVersion: s.profile?.preferenceVersion,
  });
  s.events = s.events.slice(-1000); // Store outcomes, not raw profile names, interests, credentials or prompts.
}
function requireProfile(s: State): Profile {
  if (!s.profile) throw new ApiError("PROFILE_REQUIRED", 409);
  return s.profile;
}
function failure(sourceId: string, code = "SOURCE_FAILED"): Failure {
  return { sourceId, code, message: messages[code] ?? messages.TASK_FAILED };
}
export class Backend {
  constructor(
    readonly store: JsonStore,
    readonly deps: Dependencies = dependencies,
    readonly active = sharedActive,
    readonly now: () => Date = () => new Date(),
  ) {}
  async state() {
    const state = await this.store.read();
    if (
      !Object.values(state.jobs).some(
        (j) => j.status === "running" && !this.active.has(j.id),
      )
    )
      return state;
    return this.store.update((s) => {
      for (const job of Object.values(s.jobs)) {
        if (job.status === "running" && !this.active.has(job.id)) {
          job.status = "error";
          job.stage = "failed";
          job.updatedAt = at();
          job.error = failure(job.id, "INTERRUPTED");
        }
      }
      return s;
    });
  }
  async saveProfile(input: unknown, patch = false) {
    const body = object(input),
      expected = version(body.revision);
    return this.store.update((s) => {
      if ((s.profile?.revision ?? 0) !== expected)
        throw new ApiError("VERSION_CONFLICT", 409);
      const old = s.profile;
      if (patch && !old) throw new ApiError("PROFILE_REQUIRED", 409);
      const allowed = [
        "interest",
        "preferredCreators",
        "excludedTopics",
        "techStack",
        "tasks",
        "outputLocale",
        "timeZone",
      ];
      if (
        patch &&
        Object.keys(body).some((k) => k !== "revision" && !allowed.includes(k))
      )
        throw new ApiError("INVALID_INPUT");
      const parsed = profileInput(patch ? { ...old, ...body } : body);
      const changed =
        !old ||
        hash(preferenceContext(old)) !== hash(preferenceContext(parsed));
      s.profile = {
        ...parsed,
        revision: expected + 1,
        preferenceVersion: (old?.preferenceVersion ?? 0) + Number(changed),
        updatedAt: at(),
      };
      record(s, old ? "preferences_saved" : "onboarding_completed");
      return s.profile;
    });
  }
  async confirm(input: unknown) {
    const v = object(input),
      discoveryId = text(v.discoveryId, "discoveryId", 80),
      expected = version(v.revision);
    const channelIds = ids(v.channelIds, "channelIds", 3),
      videoIds = ids(v.videoIds, "videoIds", 3);
    if (!channelIds.length && !videoIds.length)
      throw new ApiError("SELECTION_REQUIRED", 409);
    return this.store.update((s) => {
      const p = requireProfile(s),
        d = s.discoveries[discoveryId];
      if (!d) throw new ApiError("NOT_FOUND", 404);
      if (
        d.preferenceVersion !== p.preferenceVersion ||
        s.subscriptions.revision !== expected
      )
        throw new ApiError("VERSION_CONFLICT", 409);
      if (
        channelIds.some((id) => !d.channels.some((c) => c.id === id)) ||
        videoIds.some((id) => !d.videos.some((c) => c.id === id))
      )
        throw new ApiError("INVALID_INPUT");
      const channels = [
        ...new Map(
          [
            ...s.subscriptions.channels,
            ...d.channels.filter((c) => channelIds.includes(c.id)),
          ].map((c) => [c.id, c]),
        ).values(),
      ];
      const videos = [
        ...new Map(
          [
            ...s.subscriptions.videos,
            ...d.videos.filter((c) => videoIds.includes(c.id)),
          ].map((c) => [c.id, c]),
        ).values(),
      ];
      if (channels.length + videos.length > 12)
        throw new ApiError("INVALID_INPUT", 400, "subscriptions");
      s.subscriptions = { revision: expected + 1, channels, videos };
      record(s, "recommendations_confirmed");
      return s.subscriptions;
    });
  }
  async removeSubscription(kind: string, id: string, expected: unknown) {
    const revision = version(expected);
    if (kind !== "channels" && kind !== "videos")
      throw new ApiError("INVALID_INPUT");
    return this.store.update((s) => {
      if (s.subscriptions.revision !== revision)
        throw new ApiError("VERSION_CONFLICT", 409);
      if (!s.subscriptions[kind].some((v) => v.id === id))
        throw new ApiError("NOT_FOUND", 404);
      if (kind === "channels")
        s.subscriptions.channels = s.subscriptions.channels.filter(
          (v) => v.id !== id,
        );
      else
        s.subscriptions.videos = s.subscriptions.videos.filter(
          (v) => v.id !== id,
        );
      s.subscriptions.revision++;
      record(s, "subscription_removed");
      return s.subscriptions;
    });
  }
  private task(kind: Task["kind"]): Task {
    return {
      id: randomUUID(),
      kind,
      status: "running",
      stage: kind === "discovery" ? "searching" : "downloading",
      createdAt: at(),
      updatedAt: at(),
    };
  }
  private launch(job: Task, work: () => Promise<void>) {
    void work()
      .catch(async (e) => {
        await this.store
          .update((s) => {
            const j = s.jobs[job.id];
            j.status = "error";
            j.stage = "failed";
            j.updatedAt = at();
            j.error = failure(
              job.id,
              e instanceof ApiError && messages[e.code]
                ? e.code
                : "TASK_FAILED",
            );
            record(s, "task_failed", job.id);
          })
          .catch(() => {}); // Read recovery marks interrupted jobs if disk writes also fail.
      })
      .finally(() => this.active.delete(job.id));
  }
  private async stage(id: string, stage: Task["stage"]) {
    await this.store.update((s) => {
      s.jobs[id].stage = stage;
      s.jobs[id].updatedAt = at();
    });
  }
  async startDiscovery(input: unknown) {
    const body = object(input),
      query = text(body.query ?? "", "query", 1500, true),
      job = this.task("discovery");
    let profile: Profile;
    try {
      profile = await this.store.update((s) => {
        const p = requireProfile(s);
        if (this.active.size) throw new ApiError("BUSY", 409);
        this.active.add(job.id);
        s.jobs[job.id] = job;
        record(s, "discovery_started", job.id);
        return p;
      });
    } catch (e) {
      this.active.delete(job.id);
      throw e;
    }
    this.launch(job, async () => {
      const result = await discover(profile, query, this.deps);
      await this.store.update((s) => {
        s.discoveries[job.id] = {
          id: job.id,
          preferenceVersion: profile.preferenceVersion,
          query,
          createdAt: at(),
          ...result,
        };
        Object.assign(s.jobs[job.id], {
          status: "done",
          stage: "complete",
          updatedAt: at(),
          resultId: job.id,
        });
        record(s, "discovery_completed", job.id);
      });
    });
    return job;
  }
  async startDaily(input: unknown) {
    const body = object(input);
    if (body.refresh !== undefined && typeof body.refresh !== "boolean")
      throw new ApiError("INVALID_INPUT", 400, "refresh");
    await this.state();
    const job = this.task("daily");
    let started: {
      job: Task;
      fresh: boolean;
      profile: Profile;
      subscriptions: Subscriptions;
      date: string;
    };
    try {
      started = await this.store.update((s) => {
        const p = requireProfile(s),
          subs = s.subscriptions,
          date = localDate(this.now(), p.timeZone);
        if (!subs.channels.length && !subs.videos.length)
          throw new ApiError("SELECTION_REQUIRED", 409);
        const cacheKey = hash({
          date,
          timeZone: p.timeZone,
          preferences: p.preferenceVersion,
          subscriptions: subs.revision,
        });
        const prior = Object.values(s.jobs)
          .filter((j) => j.kind === "daily" && j.cacheKey === cacheKey)
          .at(-1);
        if (
          prior &&
          (prior.status === "running" ||
            (!body.refresh && ["done", "partial"].includes(prior.status)))
        )
          return {
            job: prior,
            fresh: false,
            profile: p,
            subscriptions: subs,
            date,
          };
        if (this.active.size) throw new ApiError("BUSY", 409);
        this.active.add(job.id);
        job.cacheKey = cacheKey;
        s.jobs[job.id] = job;
        record(s, "daily_started", job.id);
        return { job, fresh: true, profile: p, subscriptions: subs, date };
      });
    } catch (e) {
      this.active.delete(job.id);
      throw e;
    }
    if (started.fresh)
      this.launch(job, () =>
        this.buildDaily(
          job.id,
          started.profile,
          started.subscriptions,
          started.date,
        ),
      );
    return started.job;
  }
  private async buildDaily(
    id: string,
    profile: Profile,
    subs: Subscriptions,
    date: string,
  ) {
    const failures: Failure[] = [],
      candidates: Candidate[] = [...subs.videos];
    for (const channel of subs.channels) {
      // Search matches remain usable when listing recent uploads fails.
      const state = await this.store.read();
      const matches = Object.values(state.discoveries)
        .reverse()
        .flatMap((d) => d.videos.filter((v) => v.channelId === channel.id));
      candidates.push(
        ...[...new Map(matches.map((v) => [v.id, v])).values()].slice(0, 3),
      );
      try {
        const recent = await this.deps.channelVideos(channel.id);
        candidates.push(
          ...recent.map((v) => ({
            ...v,
            channelId: channel.id,
            channel: channel.name,
          })),
        );
      } catch {
        failures.push(failure(channel.id));
      }
    }
    const unique = [...new Map(candidates.map((v) => [v.id, v])).values()];
    const selected = await chooseVideos(profile, unique, this.deps);
    const clips: Daily["clips"] = [];
    for (const video of selected) {
      try {
        await this.stage(id, "downloading");
        const key = hash({
          videoId: video.id,
          preferences: preferenceContext(profile),
          analysisVersion: 1,
        });
        const cached = (await this.store.read()).analyses[key];
        let clip: Daily["clips"][number];
        if (cached) {
          await this.deps.download(video.id);
          clip = cached;
        } else {
          clip = await analyze(profile, video, this.deps, () =>
            this.stage(id, "analyzing"),
          );
          await this.store.update((s) => {
            s.analyses[key] = clip;
          });
        }
        clips.push(clip);
      } catch {
        failures.push(failure(video.id));
      }
    }
    clips.sort(
      (a, b) => b.relevance - a.relevance || a.videoId.localeCompare(b.videoId),
    );
    await this.stage(id, "briefing");
    let briefing: Daily["briefing"] = { summary: emptyBriefing, takeaways: [] };
    if (clips.length) {
      try {
        briefing = await brief(clips, this.deps);
      } catch {
        briefing = { summary: messages.BRIEFING_FAILED, takeaways: [] };
        failures.push(failure("briefing", "BRIEFING_FAILED"));
      }
    }
    const result: Daily = {
      id,
      date,
      timeZone: profile.timeZone,
      preferenceVersion: profile.preferenceVersion,
      subscriptionRevision: subs.revision,
      generatedAt: at(),
      clips,
      briefing,
      failures,
    };
    await this.store.update((s) => {
      s.dailies[id] = result;
      const status = failures.length
        ? clips.length
          ? "partial"
          : "error"
        : "done";
      Object.assign(s.jobs[id], {
        status,
        stage: status === "error" ? "failed" : "complete",
        updatedAt: at(),
        resultId: id,
      });
      if (status === "error") s.jobs[id].error = failure(id, "TASK_FAILED");
      record(s, `daily_${status === "done" ? "completed" : status}`, id);
    });
  }
  async getJob(id: string) {
    const s = await this.state(),
      job = s.jobs[id];
    if (!job) throw new ApiError("NOT_FOUND", 404);
    return {
      job,
      result: job.resultId
        ? job.kind === "daily"
          ? s.dailies[job.resultId]
          : s.discoveries[job.resultId]
        : null,
    };
  }
  async dashboard() {
    const s = await this.state(),
      p = requireProfile(s),
      date = localDate(this.now(), p.timeZone);
    const daily =
      Object.values(s.dailies)
        .reverse()
        .find(
          (d) =>
            d.date === date &&
            d.timeZone === p.timeZone &&
            d.preferenceVersion === p.preferenceVersion &&
            d.subscriptionRevision === s.subscriptions.revision,
        ) ?? null;
    return {
      date,
      timeZone: p.timeZone,
      preferenceVersion: p.preferenceVersion,
      subscriptionRevision: s.subscriptions.revision,
      daily,
    };
  }
}
export const backend = new Backend(
  new JsonStore(resolve(".data/backend/state.json")),
);
