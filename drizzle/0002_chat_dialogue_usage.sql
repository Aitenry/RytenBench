CREATE TABLE "chat_dialogue_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"topic_id" integer NOT NULL,
	"dialogue_id" integer NOT NULL,
	"provider_id" integer,
	"provider" text,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"total_tokens" integer,
	"calls" integer DEFAULT 0,
	"usage_metadata" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "chat_dialogue_usage_dialogue_id_key" UNIQUE("dialogue_id")
);
--> statement-breakpoint
ALTER TABLE "chat_dialogue_usage" ADD CONSTRAINT "chat_dialogue_usage_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_dialogue_usage" ADD CONSTRAINT "chat_dialogue_usage_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."chat_topic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_dialogue_usage" ADD CONSTRAINT "chat_dialogue_usage_dialogue_id_fkey" FOREIGN KEY ("dialogue_id") REFERENCES "public"."chat_dialogue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chat_dialogue_usage_topic" ON "chat_dialogue_usage" USING btree ("topic_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_chat_dialogue_usage_workspace" ON "chat_dialogue_usage" USING btree ("workspace_id" int4_ops,"created_at" timestamp_ops);