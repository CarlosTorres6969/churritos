import { NextResponse } from "next/server"
import { withApi } from "@/lib/api"
import { requestUser } from "@/lib/server-auth"
export const GET = withApi(async request => NextResponse.json({ success: true, data: { user: requestUser(request) } }), { allowPasswordChange: true })
