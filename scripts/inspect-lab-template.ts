import fs from "node:fs";
import { PDFDocument, PDFName } from "pdf-lib";
import zlib from "node:zlib";

const path = "C:\\Users\\Parthrajsinh Gohil\\Desktop\\candela\\public\\templates\\60984.pdf";

function cleanStream(input: string): string {
  let out = "";
  let i = 0;
  const n = input.length;
  while (i < n) {
    const c = input[i];
    if (c === "(") {
      let depth = 1;
      i++;
      while (i < n && depth > 0) {
        const ch = input[i];
        if (ch === "\\") {
          i += 2;
          continue;
        }
        if (ch === "(") depth++;
        if (ch === ")") depth--;
        i++;
      }
      continue;
    }
    if (c === "<") {
      if (input[i + 1] === "<") {
        let depth = 1;
        i += 2;
        while (i < n && depth > 0) {
          if (i + 1 < n && input[i] === "<" && input[i + 1] === "<") {
            depth++;
            i += 2;
          } else if (i + 1 < n && input[i] === ">" && input[i + 1] === ">") {
            depth--;
            i += 2;
          } else {
            i++;
          }
        }
      } else {
        while (i < n && input[i] !== ">") i++;
        i++;
      }
      continue;
    }
    if (c === "[") {
      let depth = 1;
      i++;
      while (i < n && depth > 0) {
        if (input[i] === "(") {
          let pDepth = 1;
          i++;
          while (i < n && pDepth > 0) {
            if (input[i] === "\\") { i += 2; continue; }
            if (input[i] === "(") pDepth++;
            if (input[i] === ")") pDepth--;
            i++;
          }
          continue;
        }
        if (input[i] === "[") depth++;
        if (input[i] === "]") depth--;
        i++;
      }
      continue;
    }
    if (c === "%") {
      while (i < n && input[i] !== "\n" && input[i] !== "\r") i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

type CTM = [number, number, number, number, number, number];

function multiply(m1: CTM, m2: CTM): CTM {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[1] * m2[5] + m1[4],
    m1[2] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function transformY(ctm: CTM, x: number, y: number) {
  return ctm[2] * x + ctm[3] * y + ctm[5];
}

async function main() {
  const bytes = fs.readFileSync(path);
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(0);
  const H = page.getHeight();
  const W = page.getWidth();
  console.log("Page size:", W, H);

  const contents = (page as any).node.Contents();
  const refs = (contents as any).asArray ? (contents as any).asArray() : [contents];
  const allTokens: string[] = [];
  for (let idx = 0; idx < refs.length; idx++) {
    const obj = doc.context.lookup(refs[idx]) as any;
    const raw = obj.getContents();
    let de = "";
    try {
      de = zlib.inflateSync(raw).toString("latin1");
    } catch {
      de = raw.toString("latin1");
    }
    const cleaned = cleanStream(de);
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    allTokens.push(...tokens);
  }

  // Parse tokens: track CTM, collect re and line elements
  const ctmStack: CTM[] = [];
  let ctm: CTM = [1, 0, 0, 1, 0, 0];
  const fullWidthLines: { minTop: number; maxTop: number }[] = [];

  let i = 0;
  while (i < allTokens.length) {
    const t = allTokens[i];
    if (t === "q") {
      ctmStack.push(ctm);
      i++;
      continue;
    }
    if (t === "Q") {
      ctm = ctmStack.pop() ?? ctm;
      i++;
      continue;
    }
    if (t === "cm") {
      const a = Number(allTokens[i - 6]);
      const b = Number(allTokens[i - 5]);
      const c = Number(allTokens[i - 4]);
      const d = Number(allTokens[i - 3]);
      const e = Number(allTokens[i - 2]);
      const f = Number(allTokens[i - 1]);
      ctm = multiply(ctm, [a, b, c, d, e, f]);
      i++;
      continue;
    }
    if (t === "re") {
      const x = Number(allTokens[i - 4]);
      const y = Number(allTokens[i - 3]);
      const w = Number(allTokens[i - 2]);
      const h = Number(allTokens[i - 1]);
      const ys = [transformY(ctm, x, y), transformY(ctm, x + w, y), transformY(ctm, x, y + h), transformY(ctm, x + w, y + h)];
      const minPageY = Math.min(...ys);
      const maxPageY = Math.max(...ys);
      const minTop = H - maxPageY;
      const maxTop = H - minPageY;
      // width in page x
      const xs = [transformX(ctm, x, y), transformX(ctm, x + w, y), transformX(ctm, x, y + h), transformX(ctm, x + w, y + h)];
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const width = maxX - minX;
      const height = maxTop - minTop;
      console.log("re", { x, y, w, h, minX, maxX, width, minTop, maxTop, height });
      if (width >= W * 0.75 && height < 8 && maxTop < H * 0.5) {
        fullWidthLines.push({ minTop, maxTop });
      }
      i++;
      continue;
    }
    i++;
  }

  console.log("fullWidthLines:", fullWidthLines);

  // cluster by minTop
  const sorted = fullWidthLines.slice().sort((a, b) => a.minTop - b.minTop);
  const CLUSTER_GAP = 40;
  let headerBottom = 0;
  if (sorted.length) {
    let clusterMax = sorted[0].maxTop;
    for (let k = 1; k < sorted.length; k++) {
      if (sorted[k].minTop - sorted[k - 1].minTop > CLUSTER_GAP) {
        headerBottom = clusterMax;
        break;
      }
      clusterMax = Math.max(clusterMax, sorted[k].maxTop);
    }
    headerBottom = Math.max(headerBottom, clusterMax);
  }
  console.log("headerBottom", headerBottom, "marginTop", headerBottom + 16);
}

function transformX(ctm: CTM, x: number, y: number) {
  return ctm[0] * x + ctm[1] * y + ctm[4];
}

main().catch(console.error);
