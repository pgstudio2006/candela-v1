import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;
  const doc = await prisma.patientDocument.findUnique({
    where: { id: docId },
    select: { fileUrl: true, fileName: true, mimeType: true, category: true },
  });

  if (!doc || doc.category !== "ipd_final_bill") {
    return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
  }

  const base64 = doc.fileUrl.split(",")[1] ?? "";
  const mimeType = doc.mimeType || doc.fileUrl.match(/data:([^;]+)/)?.[1] || "application/octet-stream";
  const buffer = Buffer.from(base64, "base64");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.fileName)}"`,
    },
  });
}
