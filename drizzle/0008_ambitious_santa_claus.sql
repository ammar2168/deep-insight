CREATE TABLE "access_code" (
	"code" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"redeemed_at" timestamp with time zone,
	"redeemed_by_user_id" text
);
--> statement-breakpoint
ALTER TABLE "access_code" ADD CONSTRAINT "access_code_redeemed_by_user_id_user_id_fk" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;