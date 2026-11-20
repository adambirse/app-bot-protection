import { NextResponse, type NextRequest } from "next/server";
import { checkBasicAuth, challengeResponse } from "@cms-bot/basic-auth";

export function proxy(request: NextRequest) {
  if (checkBasicAuth(request.headers.get("authorization")) === "challenge") {
    return challengeResponse("CMS");
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
