export const locales = ["zh-CN", "en", "ja"] as const;
export type Locale = (typeof locales)[number];
export type Localized = Record<Locale, string>;
export const occupations = [
  "student",
  "backend_developer",
  "frontend_developer",
  "fullstack_developer",
  "data_analyst",
  "product_manager",
  "tech_hobbyist",
  "other",
] as const;
export type ProfileInput = {
  name: string;
  occupation: (typeof occupations)[number];
  occupationOther: string;
  techStack: { id: string; name: string }[];
  tasks: { id: string; name: string; techStackIds: string[] }[];
  interest: string;
  preferredCreators: string;
  excludedTopics: string[];
  outputLocale: Locale;
  timeZone: string;
};
export type Profile = ProfileInput & {
  revision: number;
  preferenceVersion: number;
  updatedAt: string;
};
export type Candidate = {
  id: string;
  title: string;
  channelId: string;
  channel: string;
  description?: string;
  duration?: number;
};
export type RecommendedVideo = Candidate & {
  titleI18n: Localized;
  reason: Localized;
  relevance: number;
};
export type RecommendedChannel = {
  id: string;
  name: string;
  url: string;
  reason: Localized;
};
export type Discovery = {
  id: string;
  preferenceVersion: number;
  query: string;
  createdAt: string;
  channels: RecommendedChannel[];
  videos: RecommendedVideo[];
};
export type Subscriptions = {
  revision: number;
  channels: RecommendedChannel[];
  videos: RecommendedVideo[];
};
export type Chapter = {
  id: string;
  title: Localized;
  reason: Localized;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  evidence: string;
};
export type Clip = {
  videoId: string;
  channelId: string;
  channel: string;
  originalTitle: string;
  title: Localized;
  summary: Localized;
  reason: Localized;
  relevance: number;
  url: string;
  mediaUrl: string;
  durationSeconds: number;
  chapters: Chapter[];
};
export type Failure = { sourceId: string; code: string; message: Localized };
export type Briefing = {
  summary: Localized;
  takeaways: {
    text: Localized;
    sources: { videoId: string; chapterId: string | null }[];
  }[];
};
export type Daily = {
  id: string;
  date: string;
  timeZone: string;
  preferenceVersion: number;
  subscriptionRevision: number;
  generatedAt: string;
  clips: Clip[];
  briefing: Briefing;
  failures: Failure[];
};
export type Task = {
  id: string;
  kind: "discovery" | "daily";
  status: "running" | "done" | "partial" | "error";
  stage:
    | "searching"
    | "downloading"
    | "analyzing"
    | "briefing"
    | "complete"
    | "failed";
  createdAt: string;
  updatedAt: string;
  resultId?: string;
  cacheKey?: string;
  error?: Failure;
};
export type State = {
  schemaVersion: 1;
  profile: Profile | null;
  subscriptions: Subscriptions;
  discoveries: Record<string, Discovery>;
  jobs: Record<string, Task>;
  dailies: Record<string, Daily>;
  analyses: Record<string, Clip>;
  events: {
    id: string;
    name: string;
    at: string;
    jobId?: string;
    preferenceVersion?: number;
  }[];
};
export function emptyState(): State {
  return {
    schemaVersion: 1,
    profile: null,
    subscriptions: { revision: 0, channels: [], videos: [] },
    discoveries: {},
    jobs: {},
    dailies: {},
    analyses: {},
    events: [],
  };
}
