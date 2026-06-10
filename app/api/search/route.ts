import { NextRequest, NextResponse } from "next/server";
import { searchTicker } from "@/lib/marketData";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim();

  if (!query || query.length < 1) {
    return NextResponse.json([]);
  }

  try {
    const results = await searchTicker(query);
    return NextResponse.json(results);
  } catch {
    return NextResponse.json([]);
  }
}
