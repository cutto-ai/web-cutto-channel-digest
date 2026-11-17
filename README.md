# Channel Digest

Localhost YouTube channel discovery and timestamped highlights, built with TypeScript, Next.js and DeepSeek Harness.

## Run

Requires Node.js >=24.9, Bun, yt-dlp, FFmpeg and FFprobe. The acquisition stage calls the existing `youtube-download-with-subtitle` Skill script; configure its absolute path.

```sh
bun install
cp .env.example .env.local
# Fill PROVIDER_API_KEY and YOUTUBE_DOWNLOAD_SCRIPT locally.
bun run dev
```

Open http://localhost:3210. The application binds only to loopback. The model provider is `https://ai.clsr.top/v1` using **OpenAI Responses**, with `gpt-6.1-sol` as the default model. `PROVIDER_MODEL=gpt-6-astra` selects the alternative. Use a key issued by that provider, not an unrelated DeepSeek account. Keys remain in the ignored `.env.local`; the browser receives only a configured/not-configured flag.

## User flow

1. Enter an interest, goal and optional exclusions.
2. The channel-discovery agent produces a search query, receives real yt-dlp search results, and ranks up to three distinct channels from those results. This is a ranking of retrieved candidates, not a global YouTube ranking.
3. Select channels and confirm. No media download starts before this step.
4. The acquisition agent selects one video from search-matched videos and each channel's six most recent uploads. The application executes the existing bounded download Skill.
5. The analysis agent reads all timestamped transcript segments in batches. Code resolves the selected segment IDs to actual timestamps and rejects invalid ranges. Click a highlight to seek in the downloaded video.

The three roles run in separate DeepSeek Harness sessions. The application performs the bounded yt-dlp operations and supplies verified results to the agent. Harness uses its official `sdk-minimal` profile with shell and filesystem tools disabled. This is not yet a distributable Harness plugin; extraction and publication are deferred until requested.

## Scope and limitations

- Single local presenter, one running workflow at a time. No cloud deployment or multi-user authentication.
- The existing download Skill requires native 1080p, original English audio and original English captions (manual or automatic). Unsupported videos fail visibly. It does not use browser cookies or bypass login requirements.
- Analysis is based on speech transcripts, not visual frame analysis. Empty highlights are a valid result.
- Downloads and successful receipts are cached in `.data/media`. Job state and activity records are in `.data/jobs`. A server restart marks interrupted jobs as failed; start a new workflow to retry. Completed video downloads are reused only after checking all three files. Incomplete caches are reacquired into a fresh attempt directory while preserving remaining files.
- SDK and runtime are pinned to `0.2.2-rc.3`. Config-only initialization does not prove provider credentials or inference compatibility.
- First-time 1080p downloads can take several minutes. Select one channel for the initial demonstration.

## Verification

```sh
bun test
bun run typecheck
bun run build
```

Tests cover source timestamp resolution, missing IDs, out-of-range captions, empty matches and structured JSON parsing. Live inference and full acquisition require the local provider credential and a suitable accessible YouTube video.

## Usage measurement

Local job events record discovery, confirmation, acquisition and analysis outcomes. No external analytics platform is connected for this localhost demo. A saved usage dashboard and real-user usage acceptance remain deferred; technical tests do not prove user value.
