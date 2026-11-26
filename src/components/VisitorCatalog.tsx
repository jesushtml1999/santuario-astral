import { headers } from "next/headers";
import CatalogExperience from "@/components/CatalogExperience";
import { resolveVisitorCountry } from "@/lib/visitorCountry";

/** Kept inside the page's Suspense boundary for request-time rendering. */
export default async function VisitorCatalog() {
  const requestHeaders = await headers();
  const visitorCountry = resolveVisitorCountry(
    requestHeaders.get("x-vercel-ip-country"),
  );

  // The same serialized value is used by SSR and the first client render.
  // No global cache, browser location permission, IP lookup API or client fetch.
  return <CatalogExperience visitorCountry={visitorCountry} />;
}
