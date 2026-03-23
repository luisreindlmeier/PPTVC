/* global fetch, TextEncoder, Blob, btoa */

import type { GitHubSyncConfig } from "../storage";
import type { Version } from "../versions";

const SYNC_ROOT = "pptvc-versions";
const API_BASE = "https://api.github.com";

export interface SyncProgress {
  current: number;
  total: number;
  label: string;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

export interface SyncResult {
  pushed: number;
  errors: string[];
}

// ── Folder naming ──────────────────────────────────────────────
// Produces a human-readable, date-sortable, deterministic folder name:
// e.g. "2026-03-23T14-30--final-draft--ab3def"

function versionFolderName(version: Version): string {
  const d = new Date(version.timestamp);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const datePart = `${yyyy}-${mm}-${dd}T${hh}-${min}`;

  const rawName = (version.displayName ?? version.name).trim();
  const slug =
    rawName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "version";

  // ID format is "{timestamp}-{6charSuffix}" — use the random suffix for uniqueness
  const idSuffix = version.id.split("-").pop()?.slice(0, 6) ?? version.id.slice(-6);

  return `${datePart}--${slug}--${idSuffix}`;
}

// ── GitHub API helpers ─────────────────────────────────────────

function apiHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function getFileSha(config: GitHubSyncConfig, path: string): Promise<string | null> {
  const [owner, repo] = config.repo.split("/");
  const url = `${API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${config.branch}`;
  const res = await fetch(url, { headers: apiHeaders(config.token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const data = (await res.json()) as { sha: string };
  return data.sha;
}

async function putFile(
  config: GitHubSyncConfig,
  path: string,
  contentBase64: string,
  sha: string | null,
  message: string
): Promise<void> {
  const [owner, repo] = config.repo.split("/");
  const url = `${API_BASE}/repos/${owner}/${repo}/contents/${path}`;
  const body: Record<string, string> = {
    message,
    content: contentBase64,
    branch: config.branch,
  };
  if (sha !== null) body["sha"] = sha;
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...apiHeaders(config.token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? `GitHub API ${res.status}`);
  }
}

// ── Encoding helpers ───────────────────────────────────────────

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

function jsonToBase64(value: unknown): string {
  const json = JSON.stringify(value, null, 2);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ── Public API ─────────────────────────────────────────────────

export async function testGitHubConnection(config: GitHubSyncConfig): Promise<void> {
  const parts = config.repo.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('Invalid repo format. Use "owner/repo".');
  }
  const [owner, repo] = parts;
  const res = await fetch(`${API_BASE}/repos/${owner}/${repo}`, {
    headers: apiHeaders(config.token),
  });
  if (res.status === 401) throw new Error("Invalid token.");
  if (res.status === 404) throw new Error("Repository not found or no access.");
  if (!res.ok) throw new Error(`GitHub API ${res.status}.`);
}

export async function pushVersionsToGitHub(
  config: GitHubSyncConfig,
  versions: Version[],
  getBlob: (snapshotPath: string) => Promise<Blob>,
  onProgress: SyncProgressCallback
): Promise<SyncResult> {
  const total = versions.length * 2;
  let current = 0;
  let pushed = 0;
  const errors: string[] = [];

  for (const version of versions) {
    const label = version.displayName ?? version.name;
    const folder = `${SYNC_ROOT}/${versionFolderName(version)}`;
    const metaPath = `${folder}/meta.json`;
    const snapshotPath = `${folder}/snapshot.pptx`;

    onProgress({ current: ++current, total, label: `Uploading metadata: ${label}` });
    try {
      const sha = await getFileSha(config, metaPath);
      const content = jsonToBase64({
        id: version.id,
        name: version.name,
        displayName: version.displayName,
        authorName: version.authorName,
        authorEmail: version.authorEmail,
        tags: version.tags,
        timestamp: version.timestamp,
        filename: version.filename,
      });
      await putFile(config, metaPath, content, sha, `sync: "${label}" — metadata`);
      pushed++;
    } catch (err) {
      errors.push(`${label} (metadata): ${err instanceof Error ? err.message : String(err)}`);
    }

    onProgress({ current: ++current, total, label: `Uploading snapshot: ${label}` });
    try {
      const sha = await getFileSha(config, snapshotPath);
      const blob = await getBlob(version.snapshotPath);
      const content = await blobToBase64(blob);
      await putFile(config, snapshotPath, content, sha, `sync: "${label}" — snapshot`);
      pushed++;
    } catch (err) {
      errors.push(`${label} (snapshot): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { pushed, errors };
}
