import type { MasterProfile, MasterPrivateContact } from "@/types";

export type StaffRole = "maestro" | "admin";
export interface StaffSession {
  uid: string;
  role: StaffRole;
  masterId?: string;
  displayName: string;
  email: string;
  mode: "local" | "firebase";
}
export interface MasterEditorInput extends MasterPrivateContact {
  countryCode: string;
  /** Private E.164 contact: never stored in the public master document. */
  phone: string;
  name: string;
  specialties: string[];
  experienceYears: number;
  bio: string;
  avatarUrl: string;
  login: string;
  password?: string;
  isTestProfile: boolean;
}
export interface MasterDirectoryEntry extends MasterPrivateContact {
  phone: string;
  profile: MasterProfile;
  login: string;
  accessPending?: boolean;
}
export interface DirectoryPage {
  entries: MasterDirectoryEntry[];
  nextCursor: string | null;
}
