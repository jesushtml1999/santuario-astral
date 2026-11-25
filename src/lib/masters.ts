import { mockMasters } from "@/lib/mockMasters";
import { isFirebaseConfigured } from "@/lib/firebaseEnvironment";
import {
  readLocalMasters,
  MASTERS_CHANGED,
  MASTERS_KEY,
} from "@/lib/localMasters";
import { parseMaster } from "@/lib/masterValidation";
import { masterIsOnline, onPresenceExpiry } from "@/lib/presence";
import type { MasterProfile } from "@/types";
export { safeAvatarUrl } from "@/lib/masterValidation";
export interface MastersResult {
  masters: MasterProfile[];
  isDemo: boolean;
}
export const fallbackMasters: MastersResult = {
  masters: mockMasters.map((profile) => ({ ...profile, isOnline: false })),
  isDemo: true,
};
function localResult(): MastersResult {
  try {
    return {
      masters: readLocalMasters().filter((master) => master.isActive),
      isDemo: true,
    };
  } catch {
    return fallbackMasters;
  }
}
export function subscribeMasters(
  next: (value: MastersResult) => void,
): () => void {
  let cancelExpiry = () => {};
  const stop = subscribeRawMasters((value) => {
    cancelExpiry();
    const emit = () => {
      cancelExpiry();
      next({ ...value, masters: value.masters.map((profile) => ({
        ...profile, isOnline: masterIsOnline(profile, !value.isDemo || isFirebaseConfigured()),
      })) });
      const nearest = Math.min(...value.masters
        .filter((profile) => profile.isOnline && (profile.presenceExpiresAt ?? 0) > Date.now())
        .map((profile) => profile.presenceExpiresAt!));
      cancelExpiry = onPresenceExpiry(Number.isFinite(nearest) ? nearest : undefined, emit);
    };
    emit();
  });
  return () => { cancelExpiry(); stop(); };
}

function subscribeRawMasters(
  next: (value: MastersResult) => void,
): () => void {
  let active = true;
  const stops: Array<() => void> = [];
  if (!isFirebaseConfigured()) {
    const refresh = () => {
      if (active) next(localResult());
    };
    const storage = (event: StorageEvent) => {
      if (event.key === MASTERS_KEY || event.key === null) refresh();
    };
    window.addEventListener(MASTERS_CHANGED, refresh);
    window.addEventListener("storage", storage);
    queueMicrotask(refresh);
    return () => {
      active = false;
      window.removeEventListener(MASTERS_CHANGED, refresh);
      window.removeEventListener("storage", storage);
    };
  }
  void Promise.all([import("@/lib/firebase"), import("firebase/firestore")])
    .then(([{ db }, { collection, query, where, doc, onSnapshot }]) => {
      if (!active) return;
      let profiles: MasterProfile[] | null = null;
      let initialized: boolean | null = null;
      const emit = () => {
        if (
          active &&
          profiles !== null &&
          (profiles.length || initialized !== null)
        )
          next(
            profiles.length || initialized
              ? { masters: profiles, isDemo: false }
              : localResult(),
          );
      };
      stops.push(
        onSnapshot(
          doc(db, "publicConfig", "catalog"),
          (snapshot) => {
            initialized = snapshot.data()?.hasMasters === true;
            emit();
          },
          () => {
            initialized = true;
            emit();
          },
        ),
      );
      // No artificial count limit: each active profile remains available in the catalog.
      stops.push(
        onSnapshot(
          query(collection(db, "masters"), where("isActive", "==", true)),
          (snapshot) => {
            profiles = snapshot.docs
              .map((item) => parseMaster(item.id, item.data()))
              .filter(
                (item): item is MasterProfile => item !== null && item.isActive,
              );
            emit();
          },
          () => {
            if (active) next(localResult());
          },
        ),
      );
    })
    .catch(() => {
      if (active) next(localResult());
    });
  return () => {
    active = false;
    stops.forEach((stop) => stop());
  };
}
export async function loadMasters(): Promise<MastersResult> {
  if (!isFirebaseConfigured()) return localResult();
  const { db } = await import("@/lib/firebase");
  const { collection, query, where, getDocsFromServer } =
    await import("firebase/firestore");
  try {
    const snapshot = await getDocsFromServer(
      query(collection(db, "masters"), where("isActive", "==", true)),
    );
    return {
      masters: snapshot.docs
        .map((item) => parseMaster(item.id, item.data()))
        .filter(
          (item): item is MasterProfile => item !== null && item.isActive,
        )
        .map((profile) => ({ ...profile, isOnline: masterIsOnline(profile) })),
      isDemo: false,
    };
  } catch {
    const fallback = localResult();
    return { ...fallback, masters: fallback.masters.map((profile) => ({
      ...profile, isOnline: masterIsOnline(profile),
    })) };
  }
}
