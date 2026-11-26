import { NextResponse } from "next/server";
import { enabledProviders } from "@/lib/sources";

// GET /api/providers → the servers on the picker, for Settings → Preferred provider.
export async function GET() {
  return NextResponse.json(enabledProviders().map((p) => ({ id: p.id, name: p.name, audio: p.audio ?? ["sub"], tags: p.tags ?? [] })));
}
