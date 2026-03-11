import { NextRequest, NextResponse } from "next/server";
import { getDashboardClassesData } from "@/lib/cafci";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const days = req.nextUrl.searchParams.get("days") ?? "180";
    const data = await getDashboardClassesData(days);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
