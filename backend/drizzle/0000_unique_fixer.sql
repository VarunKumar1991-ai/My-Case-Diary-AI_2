CREATE TYPE "public"."access_level" AS ENUM('READ_ONLY');--> statement-breakpoint
CREATE TYPE "public"."account_status" AS ENUM('ACTIVE', 'BLOCKED');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'denied');--> statement-breakpoint
CREATE TYPE "public"."diary_status" AS ENUM('draft', 'finalized');--> statement-breakpoint
CREATE TYPE "public"."otp_purpose" AS ENUM('signup', 'signin', 'share-confirmation', 'visibility-change');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('OFFICER', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('PRIVATE', 'PUBLIC');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" varchar(32),
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_diaries" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" varchar(32) NOT NULL,
	"case_type_id" text NOT NULL,
	"case_diary_no" varchar(32) NOT NULL,
	"fir_no" varchar(64) NOT NULL,
	"under_section" text NOT NULL,
	"police_station" text NOT NULL,
	"incident_date_time" timestamp with time zone NOT NULL,
	"fir_registration_date_time" timestamp with time zone NOT NULL,
	"place_of_incidence" text NOT NULL,
	"plaintiff_name" text NOT NULL,
	"accused_name" text NOT NULL,
	"body" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"visibility" "visibility" DEFAULT 'PRIVATE' NOT NULL,
	"status" "diary_status" DEFAULT 'draft' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_diary_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"diary_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_types" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "case_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "designations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "designations_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "diary_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"diary_id" text NOT NULL,
	"shared_by_user_id" varchar(32) NOT NULL,
	"shared_with_user_id" varchar(32) NOT NULL,
	"access_level" "access_level" DEFAULT 'READ_ONLY' NOT NULL,
	"otp_challenge_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" varchar(254) NOT NULL,
	"hashed_code" text NOT NULL,
	"purpose" "otp_purpose" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private_access_approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"diary_id" text NOT NULL,
	"requesting_admin_id" varchar(32) NOT NULL,
	"approving_adg_id" varchar(32),
	"justification" text NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"granted_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"designation" text,
	"email" varchar(254),
	"mobile" varchar(16),
	"role" "role" DEFAULT 'OFFICER' NOT NULL,
	"account_status" "account_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_diaries" ADD CONSTRAINT "case_diaries_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_diaries" ADD CONSTRAINT "case_diaries_case_type_id_case_types_id_fk" FOREIGN KEY ("case_type_id") REFERENCES "public"."case_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_diary_revisions" ADD CONSTRAINT "case_diary_revisions_diary_id_case_diaries_id_fk" FOREIGN KEY ("diary_id") REFERENCES "public"."case_diaries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_shares" ADD CONSTRAINT "diary_shares_diary_id_case_diaries_id_fk" FOREIGN KEY ("diary_id") REFERENCES "public"."case_diaries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_shares" ADD CONSTRAINT "diary_shares_shared_by_user_id_users_id_fk" FOREIGN KEY ("shared_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_shares" ADD CONSTRAINT "diary_shares_shared_with_user_id_users_id_fk" FOREIGN KEY ("shared_with_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_shares" ADD CONSTRAINT "diary_shares_otp_challenge_id_otp_challenges_id_fk" FOREIGN KEY ("otp_challenge_id") REFERENCES "public"."otp_challenges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_access_approvals" ADD CONSTRAINT "private_access_approvals_diary_id_case_diaries_id_fk" FOREIGN KEY ("diary_id") REFERENCES "public"."case_diaries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_access_approvals" ADD CONSTRAINT "private_access_approvals_requesting_admin_id_users_id_fk" FOREIGN KEY ("requesting_admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_access_approvals" ADD CONSTRAINT "private_access_approvals_approving_adg_id_users_id_fk" FOREIGN KEY ("approving_adg_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "case_diaries_owner_case_diary_no_unique" ON "case_diaries" USING btree ("owner_id","case_diary_no");--> statement-breakpoint
CREATE INDEX "case_diaries_owner_idx" ON "case_diaries" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "case_diaries_fir_no_idx" ON "case_diaries" USING btree ("fir_no");--> statement-breakpoint
CREATE INDEX "case_diaries_visibility_idx" ON "case_diaries" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "case_diary_revisions_diary_idx" ON "case_diary_revisions" USING btree ("diary_id");--> statement-breakpoint
CREATE UNIQUE INDEX "diary_shares_diary_recipient_unique" ON "diary_shares" USING btree ("diary_id","shared_with_user_id");--> statement-breakpoint
CREATE INDEX "diary_shares_recipient_idx" ON "diary_shares" USING btree ("shared_with_user_id");--> statement-breakpoint
CREATE INDEX "otp_identifier_purpose_idx" ON "otp_challenges" USING btree ("identifier","purpose");--> statement-breakpoint
CREATE INDEX "private_access_diary_idx" ON "private_access_approvals" USING btree ("diary_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_mobile_unique" ON "users" USING btree ("mobile");