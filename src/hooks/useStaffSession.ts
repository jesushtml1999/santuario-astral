"use client";
import { useEffect, useState } from "react";
import { subscribeStaffSession } from "@/lib/staffAuth";
import type { StaffSession } from "@/types/staff";

export function useStaffSession() {
  const [state, setState] = useState<{
    session: StaffSession | null;
    loading: boolean;
    error: string;
  }>({ session: null, loading: true, error: "" });
  useEffect(
    () =>
      subscribeStaffSession(
        (session) => setState({ session, loading: false, error: "" }),
        () =>
          setState({
            session: null,
            loading: false,
            error:
              "No pudimos validar tu sesión. Revisa tu conexión y vuelve a entrar.",
          }),
      ),
    [],
  );
  return state;
}
