# Backend API for frontend integration

- Status: Review
- Owner: gokugml
- Issue: none
- Repository: `cutto-ai/web-cutto-channel-digest`
- Source of truth: this guide, [OpenAPI](openapi.json), and `lib/backend/types.ts`
- Source PR: https://github.com/cutto-ai/web-cutto-channel-digest/pull/1
- Last review: 2026-11-17
- Decision: local JSON storage, one profile, all three display languages persisted. Standalone Harness plugin distribution is deferred.

Base URL: `http://localhost:3210/api/v1`. Run one server process. This is a single local profile, without accounts or authentication. Browser clients on localhost/127.0.0.1/IPv6 loopback ports are allowed by CORS. Other origins are rejected. Keep the server on loopback.

The existing UI and `/api/jobs` remain available. New screens should use v1. The backend does not create Figma screens or change frontend components.

## Language contract

Every generated display text is persisted in **all three languages before it is published**:

```json
{
  "zh-CN": "为 Agent 设置预算上限",
  "en": "Set a budget limit for agents",
  "ja": "エージェントに予算上限を設定する"
}
```

Render `text[profile.outputLocale]`. Locale values are exactly `zh-CN`, `en`, `ja`. Switching locale only selects stored text. It does not translate on demand, re-download media, or regenerate results. Missing translations cause the affected analysis to fail visibly rather than returning a partially localized card.

All languages share video IDs, chapter IDs, timestamps, evidence and citations. Video/audio is original. `originalTitle`, channel names and subtitle `evidence` preserve the source text. `Clip.title`, `summary`, `reason`, chapter titles/reasons, and briefing text are localized. Discovery videos use `title` for the original title and `titleI18n` for its display translations. Profile inputs remain user-authored text. The frontend owns static navigation, form labels, and job stage/status labels. `/meta` supplies localized occupation labels and API errors include translated messages.

The existing downloader still requires original English audio/captions and native 1080p. This restriction concerns source acquisition, not display language. There is no dubbing or multilingual source-video expansion.

## Response envelopes

Success: `{ "data": ... }`. Failure: `{ "error": { "code": "VERSION_CONFLICT", "message": {"zh-CN":"…","en":"…","ja":"…"}, "field": "optional field" } }`.

All write requests require `Content-Type: application/json`. Bodies are limited to 64 KiB. Stable error codes include `INVALID_INPUT`, `VERSION_CONFLICT`, `PROFILE_REQUIRED`, `SELECTION_REQUIRED`, `BUSY`, `PROVIDER_NOT_CONFIGURED`, `INVALID_MODEL_OUTPUT`, `TASK_FAILED`, `INTERRUPTED`, `NOT_FOUND`, `FORBIDDEN`. Failed sources use `SOURCE_FAILED`; briefing failures use `BRIEFING_FAILED`. Use codes for behavior and localized messages for display. Responses are `Cache-Control: no-store`.

## Endpoints

| Method | Path                           | Request / response                                                                                      |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------- | ----- | ------- |
| GET    | `/meta`                        | Supported locales, occupation values and labels, source language, limits, provider configured flag      |
| GET    | `/profile`                     | `Profile` or `null`                                                                                     |
| PUT    | `/profile`                     | Complete onboarding/profile with expected `revision`; returns saved `Profile`                           |
| PATCH  | `/preferences`                 | Expected `revision` plus changed preference fields; returns saved `Profile`                             |
| POST   | `/discoveries`                 | `{ "query": "optional temporary search" }`; returns `Task`, HTTP 202                                    |
| GET    | `/jobs/{id}`                   | `{ "job": Task, "result": Discovery                                                                     | Daily | null }` |
| GET    | `/subscriptions`               | Current confirmed channels/videos plus subscription `revision`                                          |
| POST   | `/subscriptions`               | `{ "revision": 0, "discoveryId": "…", "channelIds": [], "videoIds": ["…"] }`; adds confirmed candidates |
| DELETE | `/subscriptions/channels/{id}` | `{ "revision": 1 }`; removes a channel subscription                                                     |
| DELETE | `/subscriptions/videos/{id}`   | `{ "revision": 1 }`; removes an explicitly selected video                                               |
| POST   | `/daily`                       | `{}` or `{ "refresh": true }`; returns `Task`, HTTP 202                                                 |
| GET    | `/dashboard`                   | Current date/timezone/versions and `daily: Daily                                                        | null` |

All path schemas and response types are in [openapi.json](openapi.json). TypeScript data contracts are in `lib/backend/types.ts`.

## Onboarding sequence

Collect the steps in frontend state. Submit the complete profile at the final step. Initial `revision` is 0; future updates use the last saved revision. No separate server-side draft steps are required.

```json
{
  "revision": 0,
  "name": "Alex",
  "occupation": "backend_developer",
  "occupationOther": "",
  "techStack": [
    { "id": "ts", "name": "TypeScript" },
    { "id": "pg", "name": "PostgreSQL" }
  ],
  "tasks": [
    {
      "id": "agents",
      "name": "Deploy reliable AI agents",
      "techStackIds": ["ts", "pg"]
    }
  ],
  "interest": "Production agent reliability and cost, with concrete examples",
  "preferredCreators": "FounderCoHo",
  "excludedTopics": ["Pure benchmark comparisons"],
  "outputLocale": "en",
  "timeZone": "Asia/Tokyo"
}
```

Occupation values: `student`, `backend_developer`, `frontend_developer`, `fullstack_developer`, `data_analyst`, `product_manager`, `tech_hobbyist`, `other`. `occupationOther` is required and nonempty when occupation is `other`. Stack and task IDs are frontend-generated stable strings. Every task stack ID must exist in the profile's stack list. Empty stack/task lists are valid. Names, occupation and interest are required. The timezone is an explicit IANA timezone; do not infer it from display language.

After saving, POST `/discoveries`, then poll `/jobs/{id}` every 1–2 seconds until terminal. It returns up to three real channels and matching videos from retrieved YouTube results. Call POST `/subscriptions` with selected candidates. IDs must belong to that discovery; a discovery from an older preference version cannot be confirmed. Confirmation **does not start a download**. Call POST `/daily` next. At most 12 channel/video subscriptions are stored; each confirmation accepts at most 3 channels and 3 videos.

A channel subscription authorizes selecting videos from that channel. A video selection pins that video as a candidate. Removing a pinned video does not exclude it from a subscribed channel; remove the channel too if it should no longer supply candidates. The agent ranks all eligible candidates and processes at most 3 videos per daily run; pinning adds candidates but does not guarantee every pinned video is in that day's top 3.

## Daily dashboard

On screen entry, GET `/dashboard`. If `daily` is null, POST `/daily`, then poll its job. A refresh button POSTs `/daily` with `refresh: true`. GET never starts provider or download work.

A `Daily` contains ranked `clips`, a `briefing`, source `failures`, date, timezone, preference version and subscription revision. Ranking is relevance descending, with video ID as a stable tie-breaker. A clip is a video card with expandable `chapters`. Each chapter has `startSeconds`, `endSeconds`, `durationSeconds`, localized title/reason, and original evidence. Use `mediaUrl` with the backend origin for local playback; set the player's currentTime to `startSeconds`. `url` is the original YouTube watch URL. No separate clip files are exported.

The briefing summarizes **all successfully analyzed videos in that daily run**. Each takeaway cites video IDs and optional chapter IDs. A null chapter ID cites the video-level summary. The server checks citation IDs against the supplied source set. This verifies referential integrity, not perfect factual accuracy of model summaries.

Calendar date uses the profile timezone. Cache identity includes date, timezone, preferenceVersion and subscription revision. Repeated requests reuse the same running or completed daily. Explicit refresh starts a new run unless the same daily is already running. Failed tasks can be retried; partial results are cached until explicit refresh. Refresh rechecks channel uploads, reuses valid downloads and matching analyses, and regenerates the aggregate briefing. It does not guarantee videos were published today. There is no background scheduler when the app is closed.

Task statuses: `running`, `done`, `partial`, `error`. Stages: `searching`, `downloading`, `analyzing`, `briefing`, `complete`, `failed`. A partial daily retains successful clips and reports failed sources. A complete run can have zero clips if no candidates match. Errors can retain a partial result; always inspect `result` and its failures. A briefing failure does not discard successful clips. The server permits only one active workflow across v1 and the original demo API; other workflows receive `BUSY`.

## Search and preference changes

POST `/discoveries` with a temporary query uses the saved profile plus that query. It does not change saved interests. For a lasting change, PATCH `/preferences` with `revision` and any of `interest`, `preferredCreators`, `excludedTopics`, `techStack`, `tasks`, `outputLocale`, `timeZone`. Use PUT `/profile` to change name/occupation as well.

Every saved edit increments `revision` for optimistic concurrency. Only recommendation-affecting fields increment `preferenceVersion`; changing outputLocale or name does not. Timezone changes affect the daily cache but do not change content preferences. A stale write returns HTTP 409; fetch the current state and reconcile before retrying. Existing subscriptions remain after preference edits. Current dashboard results are isolated by preference and subscription versions; an older task remains inspectable by job ID.

## Storage, recovery and validation

JSON state lives in ignored `.data/backend/state.json`. Writes are serialized and atomically renamed in one server process. No database service is required. Existing media stays in `.data/media`; legacy jobs stay in `.data/jobs`. Do not run two application processes against the same state file. Interrupted jobs are exposed as `INTERRUPTED` after server restart; retry them. This is not a durable background queue.

Local success events: `onboarding_completed`, `preferences_saved`, `recommendations_confirmed`, `subscription_removed`, `discovery_started`, `discovery_completed`, `daily_started`, `daily_completed`, `daily_partial`, `daily_error`, `task_failed`. Store IDs, timestamps and version numbers; do not store raw profile values in analytics events. The frontend owns click/expand/play events. No external analytics platform or saved dashboard is configured; product usage acceptance remains unverified.

Run `bun test`, `bun run typecheck`, `bun run build`. Automated fixtures are isolated from real provider validation. Real inference needs the existing local provider key; do not send it to browser clients or commit it.
