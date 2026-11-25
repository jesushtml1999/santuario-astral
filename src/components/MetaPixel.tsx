"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
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
  const [initialized, setInitialized] = useState(false);
  const staffRoute = /^\/(?:admin(?:\/|$)|maestro\/(?:login|panel)(?:\/|$))/.test(pathname);

  useEffect(() => {
    if (!pixelId || staffRoute || !initializeMetaPixel()) return;
    // Gate the external script until the official fbq queue and init exist.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInitialized(true);
    trackPageView();
  }, [pathname, query, pixelId, staffRoute]);

  if (
    !pixelId || !initialized || staffRoute
  )
    return null;
  return (
    <Script
      id="santuario-meta-pixel"
      src="https://connect.facebook.net/en_US/fbevents.js"
      strategy="afterInteractive"
      onReady={() => {
        trackPageView();
      }}
      onError={disableMetaPixel}
    />
  );
}
