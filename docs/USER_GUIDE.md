# TDD AI Testing Dashboard — User Guide

This guide follows the dashboard as it is implemented in this repository. It assumes the app and its external n8n/VM services have already been configured. For service setup and API details, see the [Platform Documentation](./PLATFORM_DOCUMENTATION.md).

## 1. Dashboard overview and status indicators

Open the dashboard at `http://localhost:3001/` when the local development server is running.

### KPI cards

- **Generated files** is the number of files currently returned by the VM file-list API. It is not affected by the text filter in **Generated tests**.
- **Videos today** shows the current day's trigger count. The dashboard requests it from the count webhook and keeps a browser `localStorage` value for immediate display and fallback when the live request is unavailable.
- **Total videos processed** shows the all-time `totalCount` returned by the same webhook, with a cached `localStorage` value as fallback.
- **Pipeline status** shows `Syncing`, `Online`, or `Offline` based on requests to the VM's generated-file list API. The adjacent “Last sync” time is the last successful file-list refresh. It is not a separate health check for n8n or Google Sheets.

The VM base URL is read from `NEXT_PUBLIC_VM_API_URL`; the dashboard does not hardcode `https://manhood-urgency-seismic.ngrok-free.dev`. The checked-in [`.env.example`](../.env.example) shows `https://cardstock-driller-grumbly.ngrok-free.dev` as an example instead. Confirm with your QA/deployment owner that the running app is configured for the intended VM.

### Activity feed

The **Activity** panel records recent upload, generated-file, view, link, download, folder, and error events. Use:

- **All** to see every saved event.
- **Uploads** to see local and Drive upload/trigger events.
- **Generated** to see newly detected generated files.
- **Errors** to see error-category events and events with error status.
- **Clear history** to remove the activity feed history.

The feed shows at most 30 events at a time; up to 100 are kept in browser storage. Clearing history removes activity events only—it does not reset **Videos today**, **Total videos processed**, or generated files on the VM.

## 2. Trigger a video for test generation

The uploader is on the left side of the dashboard. Use one source at a time.

### Option A — Local video upload

1. In the drop zone, click **Click to choose** and select a video, or drag one video into the drop zone.
2. The client accepts video MIME types and common video extensions, including `.mp4`, `.mov`, `.webm`, `.mkv`, `.avi`, `.m4v`, `.mpeg`, `.mpg`, `.ogv`, and `.3gp`. The default size limit is **500 MB**; deployments can configure this limit. Empty files and unsupported files are rejected.
3. Check the displayed filename and size. If needed, use **Remove** to clear the local selection.
4. Click **Upload video** to start processing. A progress indicator appears while the request is in progress. For long uploads it may show “Waiting for server…” near completion.
5. On success, the dashboard reports the accepted upload and refreshes the generated-file list. Use **Upload another** when ready to reset the form.

When a local video is selected, the Google Drive folder/file controls are disabled. While the upload is in progress, both source controls are locked. The local trigger counter is updated when the request starts, not only after a successful response; a failed or cancelled request can therefore remain counted in the local fallback.

If the header says **Endpoint not configured** or clicking **Upload video** reports that `NEXT_PUBLIC_UPLOAD_ENDPOINT` is missing, ask the deployment owner to configure the local upload endpoint. This is not a setting an end user can change from the dashboard.

### Option B — Google Drive video selection

1. Wait for the **Google Drive folder** list to load.
2. Choose a folder. If folders such as **Testing** or **01 Open Specs** are available in your deployment, select one of them.
3. Wait for the **File** list to populate, then choose a video.
4. Check the selected folder and video shown in the selection summary.
5. Click **Upload video** to trigger the selected Drive file. The dashboard reports the trigger start, then success or failure.

Once a Drive **file** is selected, the local drop zone is disabled and the UI explains that a Drive video is selected. Use **Clear Drive selection** to clear that file and switch sources. Selecting a folder without selecting a file does not itself lock the local drop zone; choosing a local video switches the selection and clears the Drive folder/file list. During Drive processing, both source controls are locked.

After a Drive request succeeds, the dashboard refreshes the generated-file list. If processing fails, read the message under the Drive controls and the corresponding entry in **Activity** before retrying.

## 3. Monitor progress, counts, and activity

### Check the run

- Look in **Activity** for a start event such as **Local video upload started** or **Drive video triggered**.
- A successful request adds a success event; a request failure adds an error event. Local cancellation resets the uploader but does not remove the start event or reverse the already-recorded local count.
- New files detected during file-list refresh are logged as generated and may display a **New** badge in the file list.

The trigger counters are incremented optimistically at trigger start and then synchronized from the count webhook. The webhook response supplies `count` and `totalCount`; the browser cache is used if live synchronization cannot provide a value. The dashboard does not show a separate “count webhook online/offline” indicator. A count that remains at its cached value may mean the webhook has not returned a new value; refreshing the file list or starting a later trigger also requests synchronization.

### Find generated specs

In **Generated tests**:

1. Click **Refresh** to request the latest VM file list. After a successful refresh, the dashboard also requests a count sync.
2. Type part of a filename into **Filter files…**. This filters filenames only; it is not a `.spec.ts`-only filter. Clear the search text to show all returned files.
3. Turn on **Auto (10s)** to poll the file list every 10 seconds. Polling pauses while the browser tab is hidden. Auto-refresh is also enabled after a successful upload/Drive trigger refresh.
4. Look for a new **.spec.ts** filename in the refreshed list. Other file types returned by the VM can also appear.

The “updated” time in **Generated tests** and the KPI’s “Last sync” refer to the VM file-list refresh, not necessarily to the count-webhook request.

## 4. View, share, and download generated tests

1. Find the desired file in **Generated tests** (for example, `TDD AI Plateform.spec.ts`, if that file is present).
2. Click the filename row to open it in the dashboard viewer. The viewer fetches the file content and displays line numbers. Use **Close**, click outside the modal, or press Escape to return to the dashboard.
3. To copy the source code, click **Copy Code** in the viewer.
4. To open sharing actions, expand **Link Options** beside the file row or in the viewer:
   - **Standalone View Link** → **Copy Link** copies a URL for `/view?file={filename}`. **Open in new tab** opens the same standalone viewer without the dashboard layout.
   - **Download Link** → **Copy Link** copies the same-origin dashboard download URL. It can be shared with someone who can access that dashboard deployment and its VM service.
   - **Download** starts a file download.
5. The viewer also has **Download File**. If the file content is already loaded, the browser saves that content; otherwise the dashboard requests the VM download endpoint.

The standalone `/view` page needs a `file` query parameter. A link opened without a filename displays a prompt; a filename not found in the VM file list displays an unavailable-file message. Shared links still depend on the receiving user being able to reach the dashboard and configured VM.

## 5. Troubleshooting

### Google Drive folder list is empty or fails

- Wait for the initial folder load to finish; the folder request is made when the uploader mounts.
- If an error message appears, check **Activity** for **Could not load Google Drive folders** and ask the service owner to check the Drive/n8n folder webhook and its browser CORS settings.
- Reloading the dashboard remounts the uploader and retries the initial folder request. There is no separate folder-refresh button in the current UI.
- If folders load but a folder has no files, select another folder or ask the service owner to verify that folder’s file-list response.

### The wrong source is selected or a control is disabled

- A selected Drive file disables local selection. Click **Clear Drive selection** before choosing a local video.
- A selected local video disables Drive controls. Click **Remove** before upload, or **Upload another** after success, to reset it.
- If a folder is selected but no Drive file is selected, the local drop zone remains available; choosing a local video clears the Drive folder selection.
- While a request is uploading/processing, wait for it to finish before changing sources. Local uploads can be stopped with **Cancel**.

### Video count looks stale

- The count values first use the browser’s saved fallback and are updated when the count webhook returns usable numeric values.
- A webhook/network failure keeps the cached count; the UI has no explicit badge that distinguishes cached values from live values.
- Try **Refresh** in **Generated tests**, reload the dashboard, or start a later trigger to cause another count-sync request. If the values remain unexpected, ask the service owner to check the count webhook’s `date`, `count`, and `totalCount` response.
- Remember that the local fallback increments when a trigger starts, so a failed/cancelled request can increase the cached number. The live webhook is needed to reconcile it with the external count source.

### A generated file does not appear

- Clear **Filter files…** in case the current search hides it.
- Click **Refresh**, or enable **Auto (10s)** and wait for a poll while the tab remains visible.
- Check **Activity** for the upload/Drive result and look for VM errors. If the file list shows an error, the dashboard keeps showing the last loaded list when one is available.
- The generated-file list comes from the configured VM API. Confirm the deployment’s `NEXT_PUBLIC_VM_API_URL` is correct and that the file has been written to a location exposed by that API. The source does not hardcode the `manhood-urgency-seismic.ngrok-free.dev` address.

### A file cannot be opened, shared, or downloaded

- Refresh the file list and select the file again; it may have been removed or regenerated.
- Confirm the VM API is reachable. The dashboard’s **Pipeline status** reflects successful access to the VM file list, not the n8n count webhook.
- Link copying can fail if browser clipboard access is blocked; use the browser’s clipboard permissions or try again from a secure context.
- The copied download URL is served by the same dashboard deployment. A recipient who cannot access that deployment or its VM service will not be able to download the file.
