import { updateMasterPresence } from "@/lib/server/masterPresence";
import { StaffApiError } from "@/lib/server/firebaseAdmin";
import { PresenceError } from "@/lib/presence";

const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  try { return Response.json(await updateMasterPresence(request), { headers }); }
  catch (cause) {
    const known = cause instanceof StaffApiError || cause instanceof PresenceError;
    return Response.json({ error: known ? cause.message : "No pudimos actualizar tu conexión." }, {
      status: known ? cause.status : 500, headers,
    });
  }
}
