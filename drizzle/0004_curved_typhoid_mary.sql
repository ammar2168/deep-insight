CREATE TABLE "user_encryption_key" (
	"userId" text PRIMARY KEY NOT NULL,
	"wrappedDek" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_encryption_key" ADD CONSTRAINT "user_encryption_key_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;