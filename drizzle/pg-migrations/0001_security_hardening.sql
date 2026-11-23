CREATE TABLE "loginAttemptLimits" (
	"scope" varchar(16) NOT NULL,
	"keyHash" varchar(64) NOT NULL,
	"requestCount" integer DEFAULT 0 NOT NULL,
	"windowStartedAt" timestamp with time zone NOT NULL,
	"blockedUntil" timestamp with time zone,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loginAttemptLimits_scope_keyHash_pk" PRIMARY KEY("scope","keyHash")
);
--> statement-breakpoint
DROP INDEX "employees_linked_user_idx";--> statement-breakpoint
CREATE INDEX "login_attempt_limits_updated_idx" ON "loginAttemptLimits" USING btree ("updatedAt");--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "employees"
		WHERE "linkedUserId" IS NOT NULL
		GROUP BY "linkedUserId"
		HAVING COUNT(*) > 1
	) THEN
		RAISE EXCEPTION 'Cannot create employees_linked_user_unique: duplicate linkedUserId values require audited repair';
	END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "employees_linked_user_unique" ON "employees" USING btree ("linkedUserId") WHERE "employees"."linkedUserId" IS NOT NULL;
