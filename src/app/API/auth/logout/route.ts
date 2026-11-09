import { NextResponse } from "next/server"
import { withApi } from "@/lib/api"
import { destroySession } from "@/lib/server-auth"
export const POST = withApi(async request => { const response = NextResponse.json({ success: true }); await destroySession(request, response); return response }, { allowPasswordChange: true })
