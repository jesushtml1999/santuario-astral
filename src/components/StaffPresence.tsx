"use client";
import { useEffect } from "react";
import { useStaffSession } from "@/hooks/useStaffSession";
import { startMasterPresence } from "@/lib/staffPresence";

export default function StaffPresence() {
  const { session } = useStaffSession();
  const uid = session?.uid;
  const role = session?.role;
  const mode = session?.mode;
  const masterId = session?.masterId;
  useEffect(() => {
    if (role !== "maestro" || !uid || !mode || !masterId) return;
    return startMasterPresence({ uid, role, mode, masterId, email: "", displayName: "" });
  }, [uid, role, mode, masterId]);
  return null;
}
