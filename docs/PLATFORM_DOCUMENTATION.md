# TDD AI Testing Framework — Platform Documentation

This document describes the behavior implemented in this repository. It distinguishes that behavior from deployment information supplied separately: the repository does not include n8n workflow exports, a direct Google Sheets client/schema, or VM-server source code. Where such external details are mentioned, they are identified as unverified contracts rather than repository facts.

## 1. System overview and architecture

### Implemented architecture

```text
Browser
  └─ Next.js dashboard (localhost:3001)
       ├─ Local video ── multipart/form-data ──> NEXT_PUBLIC_UPLOAD_ENDPOINT
       ├─ Google Drive ── POST webhooks ───────> n8n-hosted endpoints
       ├─ KPI sync ────── GET ?date=YYYY-MM-DD > video-triggers-count webhook
       │                                           └─ external Sheets-backed count
       └─ Generated file API ──────────────────> NEXT_PUBLIC_VM_API_URL
              ├─ GET /api/tests
              ├─ GET /api/tests/{filename}
              └─ GET /api/tests/{filename}/download
```

- **Dashboard:** The App Router page at [`app/page.tsx`](../app/page.tsx) is a client component. The development script serves it at `http://localhost:3001/`. It combines the uploader, generated-file explorer, KPI bar, activity feed, and selected-file viewer.
- **Local video upload:** [`components/VideoUploader.tsx`](../components/VideoUploader.tsx) posts a `FormData` payload to `NEXT_PUBLIC_UPLOAD_ENDPOINT`. The repository does not hardcode a local-upload URL; [`.env.example`](../.env.example) contains a placeholder n8n URL and comments that this is usually the production upload webhook.
- **Google Drive:** The same uploader calls these hardcoded endpoints:
  - `POST https://ai-automation-stage.oomnieye.com/webhook/get_folder_name` with `{}` to load folders.
  - `POST https://ai-automation-stage.oomnieye.com/webhook/Get_file` with `{ id, name }` to load a folder's files.
  - `POST https://ai-automation-stage.oomnieye.com/webhook/file_fetch` with `{ id, name }` to trigger processing of a selected Drive file.
- **Video-count synchronization:** [`lib/activity.ts`](../lib/activity.ts) calls `GET https://ai-automation-stage.oomnieye.com/webhook/video-triggers-count?date=YYYY-MM-DD`, with `Accept: application/json` and `ngrok-skip-browser-warning: true`. It accepts a JSON object or the first item of an array containing numeric `count` and/or `totalCount`. The dashboard labels the metrics “Videos today” and “Total videos processed”; the client does not connect directly to Google Sheets.
- **Generated-file service:** [`lib/api.ts`](../lib/api.ts) uses the base URL in `NEXT_PUBLIC_VM_API_URL` and requests `/api/tests`, `/api/tests/{filename}`, and `/api/tests/{filename}/download`. The server route at [`app/api/tests/[filename]/download/route.ts`](../app/api/tests/%5Bfilename%5D/download/route.ts) also proxies the download path. The file-list and file-content requests are made directly from the browser to the configured VM URL.
- **Generated output:** The UI expects generated files to be available from the VM file API after a successful upload/Drive trigger. The workflow that creates those files and the VM implementation that stores or serves them are not in this repository.

### External deployment details and verification boundary

The following items were supplied in the task but are **not verified by the checked-in source**:

| Supplied deployment detail | What this repository confirms |
| --- | --- |
| n8n workflow names `TDD AI Testing Framework - Demo Workflow`, `Get From Dashboard`, and `My workflow 5` | There are no workflow exports or workflow-name references in the repository. The frontend calls the webhook paths listed above; their mapping to named n8n workflows cannot be confirmed here. |
| `My workflow 5` exposes `https://ai-automation-stage.oomnieye.com/webhook/video-triggers-count` | The exact count URL is hardcoded in `lib/activity.ts`. The external workflow name and its configuration are not present. |
| Google Sheets tab `video_triggers` with `date`, `count`, and `last_update` columns | No Sheet ID, API client, schema, or direct Sheets request appears in the source. The UI obtains counts through the n8n count webhook. The webhook response contract used by the UI includes `count` and `totalCount`; how those values are calculated or mapped to sheet columns is external. |
| VM URL `https://manhood-urgency-seismic.ngrok-free.dev` and VM endpoints `/transcribe` and `/save-test` | These strings and paths do not appear in the application source. The dashboard reads `NEXT_PUBLIC_VM_API_URL` at runtime and its implemented file-service paths are `/api/tests...`. `.env.example` gives a different example base URL (`https://cardstock-driller-grumbly.ngrok-free.dev`). The ignored runtime `.env.local` is not part of this documentation. |

Consequently, do not treat `/transcribe` or `/save-test` as dashboard calls based on this repository. If those endpoints are part of a separately deployed workflow or VM, document and configure them in that external service. Likewise, the Sheet column list above is an operator-provided deployment detail, not a schema enforced by this client.

## 2. Modules, components, functions, and libraries

### Application routes and major components

| File | Responsibility and behavior |
| --- | --- |
| [`app/layout.tsx`](../app/layout.tsx) | Root layout; imports global CSS and sets page metadata and viewport theme color. It renders a light-mode `<html>` root initially. |
| [`app/page.tsx`](../app/page.tsx) | Dashboard composition and shared React state. Initializes KPI/activity state; loads local cache and starts count sync on mount; listens to the custom activity event and browser `storage` event; updates file statistics, pipeline health, selection, and query-string file links. `handleUploaded` bumps the file-explorer refresh signal after an upload/Drive request succeeds. Theme toggle updates `document.documentElement.dataset.themeMode`. |
| [`components/VideoUploader.tsx`](../components/VideoUploader.tsx) | Local file and Google Drive input, selection validation, trigger requests, progress/error state, and upload activity events. See [upload flow](#3-end-to-end-user-journey). |
| [`components/TestFileExplorer.tsx`](../components/TestFileExplorer.tsx) | Loads and filters VM-generated files, manual refresh, optional 10-second auto-refresh, new-file highlighting, selected-file callback, pipeline health callback, and per-file link actions. Background polling is paused while the document is hidden. |
| [`components/KpiBar.tsx`](../components/KpiBar.tsx) | Renders generated-file count, video counts, and pipeline status from the `DashboardKpis` prop. The tests/specs KPI markup is currently commented out in this component. |
| [`components/ActivityFeed.tsx`](../components/ActivityFeed.tsx) | Displays up to 30 of the latest supplied events; filters All, Uploads, Generated, and Errors; Clear history removes persisted activity. |
| [`components/CodeViewer.tsx`](../components/CodeViewer.tsx) | Fetches and displays a selected file, supports modal and standalone modes, copy/download, retry and error states, and optional automatic download. It refetches when file name/metadata or reload key changes. |
| [`components/FileLinkOptions.tsx`](../components/FileLinkOptions.tsx) | Copies the standalone-view or download URL, opens `/view?file=...`, or downloads a file. Emits activity events for link copies, opens, and downloads. |
| [`components/StandaloneFileViewer.tsx`](../components/StandaloneFileViewer.tsx) | Looks up a requested filename in the VM file list and then renders `CodeViewer`; reports loading, missing-file, and API error states. |
| [`app/view/page.tsx`](../app/view/page.tsx) | Resolves async `searchParams`; renders the standalone viewer for a single `file` query value, passes `download=1` as the auto-download option, or shows a missing-file prompt. |
| [`app/api/tests/[filename]/download/route.ts`](../app/api/tests/%5Bfilename%5D/download/route.ts) | Next.js `GET` route. Returns a 500 JSON error if the VM base URL is missing; otherwise fetches the VM download path, forwards selected content headers and upstream status/body, and returns a 502 JSON error if the request throws. |

### Activity and video-count helpers

[`lib/activity.ts`](../lib/activity.ts) defines the client-side activity log and count cache.

| Export | Inputs and result | State, network, or fallback behavior |
| --- | --- | --- |
| `loadActivities()` | No arguments; returns `ActivityEvent[]`. | Reads `tdd-ai.activity-events`; invalid/unavailable storage or malformed/non-array JSON returns `[]`. Filters structurally valid events and caps at 100. |
| `saveActivities(events)` | `ActivityEvent[]`; returns `void`. | Stores at most 100 events and dispatches `tdd-ai:activity-updated`. Storage errors are ignored. |
| `appendActivity(event)` | Event without required `id`/`timestamp`, optionally with either; returns the completed event. | Generates an ISO timestamp and ID if missing; avoids duplicate IDs; prepends and caps the stored list. |
| `clearActivities()` | No arguments; returns `void`. | Removes `tdd-ai.activity-events` and dispatches `tdd-ai:activity-updated`; storage errors are ignored. |
| `recordVideoTrigger()` | No arguments; returns the computed new local daily count in the browser, or `0` when called server-side or when reading/parsing storage fails. | Increments both `count` for the current browser-local date and `totalCount`; attempts to save under `tdd-ai.video-triggers` and dispatch `tdd-ai:activity-updated`. Cache write errors are swallowed, but do not change the returned computed count. It runs when either local or Drive processing is started, before the remote request completes, so a failed/cancelled request can still be reflected in the optimistic local count. |
| `getVideosTriggeredToday()` | No arguments; returns the cached count for today's local date, else `0`. | Reads `tdd-ai.video-triggers`; malformed/unavailable storage falls back to `0`. |
| `getTotalVideosProcessed()` | No arguments; returns cached lifetime total, else `0`. | Reads `totalCount` from `tdd-ai.video-triggers`; malformed/unavailable storage falls back to `0`. |
| `syncVideosTriggeredToday()` | No arguments; returns `Promise<VideoTriggerCounts>`. | Requests the hardcoded count webhook with today’s date. Accepts an object or the first item of an array. Valid non-negative numeric fields are merged with cache fallback values and cached; invalid responses, HTTP errors, or fetch/JSON errors return the cached values. Concurrent calls share one in-flight request. Successful cache writes dispatch the activity update event. |

The count-cache JSON has `date`, `count`, and `totalCount`. Older cache data without `totalCount` reads as zero until a local trigger or valid webhook response supplies it. `recordVideoTrigger()` computes the next local daily count and returns it when running in a browser; server-side calls return `0`, read/parse errors also return `0`, and cache-write errors are swallowed by the cache helper. The webhook sends the local date as `YYYY-MM-DD`; it does not use `.env`.

Important component callbacks and hooks:

- **Dashboard (`app/page.tsx`):** `useState` holds selection, refresh signal, theme, activity, and KPIs. `useEffect` loads the caches, syncs counts, and subscribes to `tdd-ai:activity-updated` and cross-tab `storage` events. `handleActivity` appends an event and reloads activity/count values; `handleHealthChange` updates pipeline status; `handleFilesChange` triggers count sync, detects newly seen files, computes file/spec/feature counts, and preserves or clears the selected file. `handleFileSelect` writes the `file` query parameter; `handleViewerClose` removes it.
- **Uploader (`VideoUploader.tsx`):** `getExtension`, `validateFile`, and `messageFromResponse` handle extension checking, file validation, and local XHR response parsing. `selectFolder` loads folder contents; `selectDriveFile` and `selectFile` switch source selection; `upload` branches between the Drive webhook and local multipart XHR. React state tracks selected inputs, upload progress/status, folder/file loading, and messages. An `AbortController` cancels folder loading on unmount; an `XMLHttpRequest` ref supports upload cancellation and is aborted on unmount.
- **Explorer (`TestFileExplorer.tsx`):** `load("initial" | "manual" | "auto")` aborts an in-flight manual/initial request before replacement, but does not stack auto polls. Refs keep callbacks current and track the request/known filenames. `useMemo` derives the case-insensitive name-filtered list and total size; auto-refresh is enabled after a successful-upload refresh signal or by the user.
- **Activity feed (`ActivityFeed.tsx`):** `useState` owns the active filter, `useMemo` derives the category-filtered events, and Clear history calls `clearActivities`.
- **Code viewer (`CodeViewer.tsx`):** An explicit load-state union tracks empty/loading/ready/error. Its effect aborts stale file-content requests and logs successful views; `copyText` uses the Clipboard API with a textarea fallback. `handleCopy` and `handleDownload` log outcomes. Modal mode locks body scrolling and supports Escape/backdrop dismissal.
- **Link options (`FileLinkOptions.tsx`):** `copyLink("view" | "download")` chooses a URL helper, copies it, and logs success/failure; `download()` calls the VM download helper and logs the outcome.
- **Standalone viewer (`StandaloneFileViewer.tsx`):** An effect loads file metadata through `listTestFiles`, finds the exact filename, and aborts on unmount or filename change.

The generated-file explorer searches filenames only; it has no dedicated “specs only” filter. Its KPI counts `.spec.ts` and `.feature` suffixes separately and classifies remaining listed files as “other.”

Activity types are in [`lib/types.ts`](../lib/types.ts): `ActivityEvent` carries `id`, `category`, `status`, `source`, `title`, `timestamp`, and optional message/metadata; `DashboardKpis` defines the metric and pipeline fields. `PipelineStatus` is `Online | Syncing | Offline`; upload status is `idle | uploading | success | error`.

### API, URLs, formatting, and shared utilities

[`lib/api.ts`](../lib/api.ts):

- `VM_API_URL` reads `NEXT_PUBLIC_VM_API_URL` and strips trailing slashes. If unset, API requests throw `ApiError`.
- `NGROK_HEADERS` sets `ngrok-skip-browser-warning: true`. Requests use CORS mode, `cache: "no-store"`, and a default 20-second timeout; download requests use 120 seconds.
- `ApiError` holds an optional HTTP status. Request handling converts HTTP, timeout, and connectivity failures to explanatory errors; external aborts remain aborts.
- `listTestFiles(signal?)` requests `GET {VM_API_URL}/api/tests`, accepts either an array or `{ files: [...] }`, and sorts newest `createdAt` first.
- `getTestFile(filename, signal?)` requests `GET {VM_API_URL}/api/tests/{encoded filename}` and rejects a response without string `content`.
- `downloadTestFile(filename)` requests the VM `/api/tests/{filename}/download` path, then saves its response as a browser Blob.
- `saveBlob(blob, filename)` creates a temporary object URL, clicks a download anchor, then revokes the URL.

[`lib/dashboard-links.ts`](../lib/dashboard-links.ts):

- `getDashboardFileLink(filename)` produces `/?file=...` on the current origin; returns `""` when called without `window`. It is exported but has no call site in the current source.
- `getStandaloneFileViewUrl(filename)` produces `/view?file=...`.
- `getFileDownloadUrl(filename)` produces `/api/tests/{filename}/download` on the current origin; this URL is served by the Next.js proxy route.
- `copyToClipboard(text)` uses the secure-context Clipboard API, then falls back to a hidden textarea and `document.execCommand("copy")`; throws if that fallback is rejected.

[`lib/format.ts`](../lib/format.ts) exports `formatBytes`, `formatDateTime`, `formatRelative`, and `languageFromFilename`. These format sizes, timestamps, elapsed-time labels, and syntax labels; invalid values return a dash or empty relative label where appropriate.

### Styles and external packages

- [`app/globals.css`](../app/globals.css) provides the dashboard’s design tokens, panels, controls, KPI grid, viewer, and responsive layout.
- [`next.config.ts`](../next.config.ts) enables React strict mode and disables the `X-Powered-By` header.
- [`postcss.config.mjs`](../postcss.config.mjs) configures `@tailwindcss/postcss`.
- [`tsconfig.json`](../tsconfig.json) enables strict TypeScript, Next’s plugin, and the `@/*` root alias.
- Runtime packages in [`package.json`](../package.json): `next` (`^16.4.6`), `react` and `react-dom` (`^19.3.1`). Development packages: `typescript` (`^5.9.3`), `tailwindcss` and `@tailwindcss/postcss` (`^4.3.5`), and Node/React type packages.
- The UI uses native browser APIs (Fetch, `XMLHttpRequest`, `FormData`, `AbortController`, local storage, Clipboard/Blob APIs) and React hooks. No Google API SDK, charting library, or separate component library is declared in `package.json`.

## 3. End-to-end user journey

1. **Open the dashboard.** Run the dev server and open `http://localhost:3001/`. The page initializes KPI state, restores saved activity and video counts from local storage, starts the count-webhook request, and asks the file explorer to load the VM file list. The “Videos today” and “Total videos processed” values can show cached values before webhook synchronization finishes.
2. **Choose a source.**
   - **Local file:** Choose or drop one file. The client accepts video MIME types or the listed video extensions (`.mp4`, `.mov`, `.webm`, `.mkv`, `.avi`, `.m4v`, `.mpeg`, `.mpg`, `.ogv`, `.3gp`), rejects empty files, and enforces `NEXT_PUBLIC_MAX_UPLOAD_MB` (default 500 MB). More than one dropped file is rejected. No activity event is written merely for choosing a local file.
   - **Google Drive:** At component mount, `get_folder_name` is called with an empty JSON object to load folder options. Selecting a folder calls `Get_file` with folder ID/name to load files in that folder. The folder selection is activity-logged; selecting an individual file does not create a separate activity event until its trigger starts.
3. **Switching and locking.** A selected **Drive file** disables local selection; a selected **local file** disables Drive selection. Selecting a local file clears the Drive folder/file selection. Selecting a Drive file clears the local file. Selecting a Drive folder alone does not disable local selection: choosing a local video switches the selection and clears the Drive folder/list. During upload/processing, both source controls are disabled. The user can clear a Drive selection or use “Remove”/“Upload another” to reset local selection.
4. **Trigger processing.**
   - A local trigger posts multipart data to `NEXT_PUBLIC_UPLOAD_ENDPOINT`, using `NEXT_PUBLIC_UPLOAD_FIELD_NAME` (default `file`) plus `filename`, `mimeType`, `size`, and `uploadedAt` fields. It uses `XMLHttpRequest` for progress and cancellation. The ngrok warning header is added when the configured URL contains `ngrok`.
   - A Drive trigger posts the selected file ID/name to the hardcoded `file_fetch` webhook and parses its response as JSON when possible.
   - Both paths increment the local daily/lifetime counters and request a count sync at start, then log an upload-start activity. Completion or failure is separately logged. Local upload cancellation resets its UI state but does not reverse the already recorded optimistic trigger count.
5. **Observe activity and generated files.** Activity is saved under `tdd-ai.activity-events` (maximum 100). The feed filters All/Uploads/Generated/Errors and displays the newest 30 events. Successful processing calls back to the dashboard, which forces a file-list refresh and enables auto-refresh. Newly detected files are logged as generated. The explorer can also refresh manually or poll every 10 seconds while enabled and the tab is visible; a filename search filters the list.
6. **Synchronize KPIs.** Initial dashboard mount and successful file-list refresh initiate count synchronization. The count endpoint receives the date query; successful numeric `count` and `totalCount` values update `tdd-ai.video-triggers` and trigger a UI refresh. HTTP/network/response failures leave the local cache in use. Local and Drive trigger starts also update the cache immediately. The lifetime value is supplied by the webhook (with the browser cache as fallback); the client does not independently read or sum Google Sheet rows.
7. **Inspect a generated file.** Select a file in the list. The dashboard adds `?file={filename}` to the URL and opens `CodeViewer` in a modal. It fetches file content, displays line numbers, and logs successful views. The modal closes via its button, backdrop, or Escape; it also refetches when file metadata changes.
8. **Share, copy, or download.**
   - **Standalone View Link** copies `/view?file={filename}`. “Open in new tab” opens the same route.
   - **Download Link** copies the same-origin `/api/tests/{filename}/download` route. That Next.js route proxies to the VM file download endpoint.
   - The file menu’s **Download** action fetches from the configured VM API directly. In the code viewer, download saves already-loaded content locally when possible; otherwise it makes the VM download request.
   - `/view?file=...` first checks the VM file list, then loads and renders that file in standalone mode. `/view?file=...&download=1` also automatically downloads it after content loads. Missing parameters, missing files, API errors, and empty file content each have explicit UI states.

## 4. Requirements and setup

### Runtime and commands

- The installed Next.js package declares Node.js `>=20.9.0`; this repository does not separately declare a Node or npm engine range.
- Use npm with the committed lockfile:

  ```sh
  npm ci
  npm run dev
  ```

- Open `http://localhost:3001/`. The `dev` and `start` scripts both use port 3001. Production use:

  ```sh
  npm run build
  npm run start
  ```

- Type/build verification:

  ```sh
  npm run typecheck
  npm run build
  ```

There is no test script in `package.json`.

### Environment configuration

Copy [`.env.example`](../.env.example) to `.env.local` and set values for the deployment. `.env.local` is ignored by Git; do not commit real credentials or private deployment settings.

| Variable | Required/use | Repository behavior |
| --- | --- | --- |
| `NEXT_PUBLIC_VM_API_URL` | Required for generated-file list, content, and VM downloads. | Base URL, without a trailing slash; the code strips trailing slashes. `.env.example` currently shows `https://cardstock-driller-grumbly.ngrok-free.dev` as its example. |
| `NEXT_PUBLIC_UPLOAD_ENDPOINT` | Required for local video submission. | Complete upload URL. `.env.example` has a placeholder `https://your-n8n-host/webhook/upload-test-video`; replace it with the actual endpoint. |
| `NEXT_PUBLIC_UPLOAD_FIELD_NAME` | Optional. | Multipart binary field name; defaults to `file`. |
| `NEXT_PUBLIC_MAX_UPLOAD_MB` | Optional. | Client-side upload limit in megabytes; defaults to `500`. |
| `TESTS_DIR` | VM-server reference only. | `.env.example` lists `./generated-tests` and notes that the VM server uses it. No VM server source is included here, and the dashboard does not read this variable. |

The count and Drive URLs are hardcoded in source rather than read from `.env`. The VM must serve the API paths the frontend requests, and browser-facing endpoints must permit requests from the dashboard origin (CORS). The UI adds `ngrok-skip-browser-warning: true` to VM requests and to the count request; the local upload adds it only if its configured URL contains `ngrok`.

### n8n, Drive, Sheets, and VM contracts

To operate the application, configure external services to match the calls actually made by this client:

1. Provide a local-upload webhook URL that accepts multipart form data and returns a successful HTTP response when accepted. The frontend UI says the downstream workflow generates Playwright tests; workflow processing itself is external.
2. Configure the three Drive endpoints with the request/response shapes described in [System overview](#implemented-architecture). The folder and file-list endpoints must return JSON arrays with string `id` and `name` values for entries to be usable.
3. Make the count webhook accept the `date` query parameter and return either `{ "count": 0, "totalCount": 0 }` or `[ { "count": 0, "totalCount": 0 } ]` with non-negative JSON numbers. It should return an accurate lifetime total if the “Total videos processed” KPI is to be authoritative. The exact Google Sheet/tab implementation is not present in the repository.
4. Make the VM file service provide `GET /api/tests`, `GET /api/tests/{filename}`, and `GET /api/tests/{filename}/download`, with file metadata and content compatible with [`lib/types.ts`](../lib/types.ts). Generated files must become visible from `GET /api/tests`.
5. Set and test `NEXT_PUBLIC_VM_API_URL` and `NEXT_PUBLIC_UPLOAD_ENDPOINT` for the target deployment. The specific `manhood-urgency-seismic.ngrok-free.dev` `/transcribe` and `/save-test` combination and the named n8n workflows are not configured by checked-in code; confirm with the separate service owner before relying on them.

The task-supplied `video_triggers` table/tab name and `date`, `count`, `last_update` columns may be used in the external workflow, but this client neither validates nor queries those columns. Its observable count API contract is the date-filtered `count` plus lifetime `totalCount` response.
