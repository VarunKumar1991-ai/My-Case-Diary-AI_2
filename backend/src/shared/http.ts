/** Request metadata threaded through service calls for audit logging — every module needs it, so it lives here rather than in any one module. */
export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}
