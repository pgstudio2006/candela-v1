import { parseActionError } from "@/lib/action-errors";
import { isTransientSessionError, sleep } from "@/lib/session-retry";

export const WORKSPACE_SYNC_MESSAGE =
  "Workspace is syncing after an update. Retrying automatically…";

export const WORKSPACE_LOAD_FAILED =
  "Workspace could not load. Refresh the page — your data is saved in the database.";

export function isRetryableWorkspaceError(error: unknown): boolean {
  if (isTransientSessionError(error)) return true;
  const { code, message } = parseActionError(error);
  if (code === "INTERNAL_ERROR") {
    const lower = message.toLowerCase();
    // Schema is out of date — no amount of client retries will fix it.
    if (
      lower.includes("out of date") ||
      lower.includes("prisma db push") ||
      lower.includes("database table missing") ||
      lower.includes("database column missing")
    ) {
      return false;
    }
    return (
      lower.includes("schema") ||
      lower.includes("database") ||
      lower.includes("connect") ||
      lower.includes("prisma") ||
      lower.includes("syncing")
    );
  }
  return false;
}

export function workspaceErrorMessage(error: unknown): string {
  const parsed = parseActionError(error);
  if (parsed.message.includes("Server Components render")) {
    return WORKSPACE_SYNC_MESSAGE;
  }
  if (isRetryableWorkspaceError(error)) {
    return WORKSPACE_SYNC_MESSAGE;
  }
  return parsed.message;
}

export async function retryWorkspaceLoad<T>(
  load: () => Promise<T>,
  opts?: { attempts?: number; baseDelayMs?: number; onRetry?: (attempt: number) => void },
): Promise<T> {
  const attempts = opts?.attempts ?? 5;
  const baseDelayMs = opts?.baseDelayMs ?? 400;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await load();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts - 1 || !isRetryableWorkspaceError(error)) break;
      opts?.onRetry?.(attempt + 1);
      await sleep(baseDelayMs * (attempt + 1));
    }
  }

  throw lastError;
}
