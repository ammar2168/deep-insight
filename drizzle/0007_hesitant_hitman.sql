CREATE TABLE "chat_usage" (
	"user_id" text PRIMARY KEY NOT NULL,
	"questions_today" integer DEFAULT 0 NOT NULL,
	"usage_date" date NOT NULL,
	"code_redeemed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_usage" ADD CONSTRAINT "chat_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;