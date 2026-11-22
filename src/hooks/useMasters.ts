"use client";
import { useEffect, useState } from "react";
import { fallbackMasters, subscribeMasters } from "@/lib/masters";
export function useMasters() {
  const [result, setResult] = useState(fallbackMasters);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(
    () =>
      subscribeMasters((value) => {
        setResult(value);
        setIsLoading(false);
      }),
    [],
  );
  return { ...result, isLoading };
}
