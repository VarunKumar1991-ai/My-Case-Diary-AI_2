/**
 * Typed client for `/auth/*` and `/me` (architecture.md §10.1: one module per
 * backend resource). Every call returns exactly what the matching
 * `backend/src/modules/auth` controller sends — see that module's `dto.ts`
 * for the request shapes these mirror.
 */
import { api } from "@/apis/client";
import type { CurrentUser } from "@/context/AuthContext";

export interface SignupDetails {
  pno: string;
  name: string;
  email?: string;
  mobile?: string;
}

export interface SigninIdentifier {
  email?: string;
  mobile?: string;
}

interface MessageResponse {
  message: string;
}

interface SessionResponse {
  user: CurrentUser;
}

export const authApi = {
  signupRequestOtp: (input: SignupDetails) =>
    api.post<MessageResponse>("/auth/signup/request-otp", input),

  signupVerify: (input: SignupDetails & { code: string }) =>
    api.post<SessionResponse>("/auth/signup/verify", input),

  signinRequestOtp: (input: SigninIdentifier) =>
    api.post<MessageResponse>("/auth/signin/request-otp", input),

  signinVerify: (input: SigninIdentifier & { code: string }) =>
    api.post<SessionResponse>("/auth/signin/verify", input),
};
