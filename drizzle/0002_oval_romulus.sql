ALTER TABLE "entry" ADD COLUMN "textHash" text;--> statement-breakpoint
CREATE INDEX "entry_user_id_text_hash_idx" ON "entry" USING btree ("userId","textHash");