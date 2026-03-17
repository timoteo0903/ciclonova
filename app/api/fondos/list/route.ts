import { NextResponse } from "next/server";
import { ALL_FUNDS } from "@/lib/funds-config";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    success: true,
    data: ALL_FUNDS.map((f) => ({
      fundId: f.fundId,
      fundName: f.fundName,
      classCount: f.classes.length,
      classes: f.classes.map((c) => ({ classId: c.classId, className: c.className })),
    })),
  });
}
