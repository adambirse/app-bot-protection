import { NextResponse, type NextRequest } from "next/server";
import { runSecurityProxy } from "@cms-bot/security";

export function proxy(request: NextRequest) {
  const decision = runSecurityProxy(request, "CMS");
  if (decision.kind === "respond") return decision.response;

  const response = NextResponse.next({ request: { headers: decision.requestHeaders } });
  for (const [name, value] of Object.entries(decision.responseHeaders)) response.headers.set(name, value);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
