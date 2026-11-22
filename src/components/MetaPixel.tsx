"use client";

import Script from "next/script";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  disableMetaPixel,
  getMetaPixelId,
  initializeMetaPixel,
  trackPageView,
} from "@/lib/metaPixel";

export default function MetaPixel() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const pixelId = getMetaPixelId();

  useEffect(() => {
    if (pixelId) trackPageView();
  }, [pathname, query, pixelId]);

  if (
    !pixelId ||
    /^\/(?:admin(?:\/|$)|maestro\/(?:login|panel)(?:\/|$))/.test(pathname)
  )
    return null;
  return (
    <Script
      id="santuario-meta-pixel"
      src="https://connect.facebook.net/en_US/fbevents.js"
      strategy="afterInteractive"
      onReady={() => {
        initializeMetaPixel();
      }}
      onError={disableMetaPixel}
    />
  );
}
