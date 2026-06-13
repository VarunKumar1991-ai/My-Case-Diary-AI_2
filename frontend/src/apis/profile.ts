/**
 * Typed client for the self-service half of `/me` (architecture.md §10.1 — the
 * `user` module owns `PATCH /me`; the `auth` module owns `GET /me`). Mirrors
 * `updateProfileSchema` (`backend/src/modules/user/dto.ts`): only the
 * free-text `name`/`designation` fields are self-editable — `pno`, `role`,
 * `accountStatus`, `email`, and `mobile` are governance- or verification-gated.
 */
import { api } from "@/apis/client";
import type { CurrentUser } from "@/context/AuthContext";

export interface UpdateProfileInput {
  name?: string;
  designation?: string;
}

export const profileApi = {
  update: (input: UpdateProfileInput) => api.patch<{ user: CurrentUser }>("/me", input),
};
