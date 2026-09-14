CREATE TABLE "user_access" (
	"user_id" text PRIMARY KEY NOT NULL,
	"granted_at" timestamp with time zone NOT NULL,
	"via_code" text
);
--> statement-breakpoint
ALTER TABLE "user_access" ADD CONSTRAINT "user_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Grandfather every account that already exists when this gate ships. These
-- predate the code requirement and are already real beta users mid-use;
-- without this they'd all be locked out of their own data on next visit.
-- via_code stays null because there genuinely wasn't one. granted_at is set
-- explicitly: the schema's default is a Drizzle $defaultFn, which applies at
-- the query builder, not as a database default this raw insert would inherit.
INSERT INTO "user_access" ("user_id", "granted_at")
SELECT "id", now() FROM "user"
ON CONFLICT ("user_id") DO NOTHING;
