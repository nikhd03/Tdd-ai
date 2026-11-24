export function getDashboardFileLink(filename: string): string {
  if (typeof window === "undefined") return "";

  const url = new URL("/", window.location.origin);
  url.searchParams.set("file", filename);
  return url.toString();
}

export function getStandaloneFileViewUrl(filename: string): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/view?file=${encodeURIComponent(filename)}`;
}

export function getFileDownloadUrl(filename: string): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/api/tests/${encodeURIComponent(filename)}/download`;
}

export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back to the document copy command if clipboard permission is unavailable.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Copy command was rejected by the browser.");
}
