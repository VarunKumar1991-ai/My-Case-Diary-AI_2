import {
  pgTable,
  text,
  varchar,
  timestamp,
  boolean,
  integer,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ── Enums ──────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum("role", ["OFFICER", "ADMIN"]);
export const accountStatusEnum = pgEnum("account_status", ["ACTIVE", "BLOCKED"]);
export const otpPurposeEnum = pgEnum("otp_purpose", [
  "signup",
  "signin",
  "share-confirmation",
  "visibility-change",
]);
export const visibilityEnum = pgEnum("visibility", ["PRIVATE", "PUBLIC"]);
export const diaryStatusEnum = pgEnum("diary_status", ["draft", "finalized"]);
export const accessLevelEnum = pgEnum("access_level", ["READ_ONLY"]);
export const approvalStatusEnum = pgEnum("approval_status", ["pending", "approved", "denied"]);

// ── User ───────────────────────────────────────────────────────────────────
// id is the officer's `pno` (UPP departmental ID) — see architecture.md Design Decision D1.

export const users = pgTable(
  "users",
  {
    id: varchar("id", { length: 32 }).primaryKey(), // pno
    name: text("name").notNull(),
    designation: text("designation"),
    email: varchar("email", { length: 254 }),
    mobile: varchar("mobile", { length: 16 }), // E.164, e.g. +91XXXXXXXXXX
    role: roleEnum("role").notNull().default("OFFICER"),
    accountStatus: accountStatusEnum("account_status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailUnique: uniqueIndex("users_email_unique").on(table.email),
    mobileUnique: uniqueIndex("users_mobile_unique").on(table.mobile),
  }),
);

// ── OTP Challenges ─────────────────────────────────────────────────────────

export const otpChallenges = pgTable(
  "otp_challenges",
  {
    id: text("id").primaryKey(),
    identifier: varchar("identifier", { length: 254 }).notNull(), // normalized email or E.164 mobile
    hashedCode: text("hashed_code").notNull(),
    purpose: otpPurposeEnum("purpose").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    identifierPurposeIdx: index("otp_identifier_purpose_idx").on(table.identifier, table.purpose),
  }),
);

// ── Case Type (admin-managed taxonomy) ─────────────────────────────────────

export const caseTypes = pgTable("case_types", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Designation (admin-managed taxonomy — §6.1 "designation (admin-configurable enum)") ─

export const designations = pgTable("designations", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Case Diary ─────────────────────────────────────────────────────────────

export const caseDiaries = pgTable(
  "case_diaries",
  {
    id: text("id").primaryKey(),
    ownerId: varchar("owner_id", { length: 32 })
      .notNull()
      .references(() => users.id),
    caseTypeId: text("case_type_id")
      .notNull()
      .references(() => caseTypes.id),
    caseDiaryNo: varchar("case_diary_no", { length: 32 }).notNull(),
    firNo: varchar("fir_no", { length: 64 }).notNull(),
    underSection: text("under_section").notNull(),
    policeStation: text("police_station").notNull(),
    incidentDateTime: timestamp("incident_date_time", { withTimezone: true }).notNull(),
    firRegistrationDateTime: timestamp("fir_registration_date_time", { withTimezone: true }).notNull(),
    placeOfIncidence: text("place_of_incidence").notNull(),
    plaintiffName: text("plaintiff_name").notNull(),
    accusedName: text("accused_name").notNull(),
    caseDiaryDate: timestamp("case_diary_date", { withTimezone: true }),
    body: jsonb("body").notNull().default({}),
    visibility: visibilityEnum("visibility").notNull().default("PUBLIC"),
    status: diaryStatusEnum("status").notNull().default("draft"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Case Diary No. is scoped to the FIR (मुकदमा): every new investigation starts
    // its own CD-001 sequence, so uniqueness is (owner, FIR, CD no.) — not owner-global.
    ownerFirCaseDiaryNoUnique: uniqueIndex("case_diaries_owner_fir_case_diary_no_unique").on(
      table.ownerId,
      table.firNo,
      table.caseDiaryNo,
    ),
    ownerIdx: index("case_diaries_owner_idx").on(table.ownerId),
    firNoIdx: index("case_diaries_fir_no_idx").on(table.firNo),
    visibilityIdx: index("case_diaries_visibility_idx").on(table.visibility),
  }),
);

// ── Case Diary Revision (immutable version history) ───────────────────────

export const caseDiaryRevisions = pgTable(
  "case_diary_revisions",
  {
    id: text("id").primaryKey(),
    diaryId: text("diary_id")
      .notNull()
      .references(() => caseDiaries.id),
    snapshot: jsonb("snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    diaryIdx: index("case_diary_revisions_diary_idx").on(table.diaryId),
  }),
);

// ── Diary Share (OTP-gated collaboration grants) ──────────────────────────

export const diaryShares = pgTable(
  "diary_shares",
  {
    id: text("id").primaryKey(),
    diaryId: text("diary_id")
      .notNull()
      .references(() => caseDiaries.id),
    sharedByUserId: varchar("shared_by_user_id", { length: 32 })
      .notNull()
      .references(() => users.id),
    sharedWithUserId: varchar("shared_with_user_id", { length: 32 })
      .notNull()
      .references(() => users.id),
    accessLevel: accessLevelEnum("access_level").notNull().default("READ_ONLY"),
    otpChallengeId: text("otp_challenge_id")
      .notNull()
      .references(() => otpChallenges.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    diaryRecipientUnique: uniqueIndex("diary_shares_diary_recipient_unique").on(
      table.diaryId,
      table.sharedWithUserId,
    ),
    recipientIdx: index("diary_shares_recipient_idx").on(table.sharedWithUserId),
  }),
);

// ── Private Access Approval (ADG-Technical gated admin access to PRIVATE diaries) ─

export const privateAccessApprovals = pgTable(
  "private_access_approvals",
  {
    id: text("id").primaryKey(),
    diaryId: text("diary_id")
      .notNull()
      .references(() => caseDiaries.id),
    requestingAdminId: varchar("requesting_admin_id", { length: 32 })
      .notNull()
      .references(() => users.id),
    approvingAdgId: varchar("approving_adg_id", { length: 32 }).references(() => users.id),
    justification: text("justification").notNull(),
    status: approvalStatusEnum("status").notNull().default("pending"),
    grantedUntil: timestamp("granted_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    diaryIdx: index("private_access_diary_idx").on(table.diaryId),
  }),
);

// ── Audit Log (append-only) ────────────────────────────────────────────────

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorId: varchar("actor_id", { length: 32 }).references(() => users.id),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    metadata: jsonb("metadata").notNull().default({}),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    actorIdx: index("audit_logs_actor_idx").on(table.actorId),
    resourceIdx: index("audit_logs_resource_idx").on(table.resourceType, table.resourceId),
  }),
);
