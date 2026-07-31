export function dataUrlToBytes(dataUrl: string): Uint8Array | undefined {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return undefined;
  const base64 = dataUrl.slice(comma + 1).trim();
  if (!base64) return undefined;
  try {
    return Buffer.from(base64, "base64");
  } catch {
    return undefined;
  }
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isDataUrl(value: string): boolean {
  return /^data:/i.test(value);
}

async function readLocalTemplateFile(fileData: string): Promise<Uint8Array> {
  const { promises: fs } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "fs");
  const path = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "path");
  const relative = fileData.startsWith("/") ? fileData.slice(1) : fileData;
  const resolved = path.default.join(/*turbopackIgnore: true*/ process.cwd(), "public", relative);
  return fs.readFile(resolved);
}

export async function loadTemplateFile(fileData: string | null | undefined): Promise<Uint8Array | undefined> {
  if (!fileData) return undefined;

  if (isDataUrl(fileData)) {
    return dataUrlToBytes(fileData);
  }

  // Browser: use fetch for local/remote paths
  if (typeof window !== "undefined") {
    const res = await fetch(fileData);
    if (!res.ok) throw new Error(`Template not found: ${fileData}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  if (isHttpUrl(fileData)) {
    const res = await fetch(fileData);
    if (!res.ok) throw new Error(`Template not found: ${fileData}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  // Local public path (e.g. "/templates/60984.pdf" or "/templates/patientroomsticker.pdf")
  return readLocalTemplateFile(fileData);
}
