import type { MasterProfile } from "@/types";

export type StaffRole = "maestro" | "admin";
export interface StaffSession {
  uid: string;
  role: StaffRole;
  masterId?: string;
  displayName: string;
  email: string;
  mode: "local" | "firebase";
}
export interface MasterEditorInput {
  name: string;
  specialties: string[];
  experienceYears: number;
  bio: string;
  avatarUrl: string;
  login: string;
  password?: string;
  isTestProfile: boolean;
}
export interface MasterDirectoryEntry {
  profile: MasterProfile;
  login: string;
}
export interface DirectoryPage {
  entries: MasterDirectoryEntry[];
  nextCursor: string | null;
}
