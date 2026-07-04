import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Please sign in first." }, { status: 401 });
  }
  const { id } = await params;
  const doc = await prisma.patientDocument.findUnique({
    where: { id },
    select: { fileUrl: true, fileName: true, mimeType: true },
  });
  if (!doc) {
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
