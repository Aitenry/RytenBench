CREATE TABLE "file_change" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"path" text NOT NULL,
	"rel_path" text NOT NULL,
	"kind" text DEFAULT 'modify' NOT NULL,
	"source" text NOT NULL,
	"topic_id" integer,
	"call_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"has_before" integer DEFAULT 0 NOT NULL,
	"has_after" integer DEFAULT 0 NOT NULL,
	"added" integer DEFAULT 0 NOT NULL,
	"removed" integer DEFAULT 0 NOT NULL,
	"before_bytes" integer DEFAULT 0 NOT NULL,
	"after_bytes" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now(),
	"reviewed_at" timestamp,
	CONSTRAINT "file_change_kind_check" CHECK (kind = ANY (ARRAY['create'::text, 'modify'::text, 'delete'::text])),
	CONSTRAINT "file_change_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'kept'::text, 'reverted'::text, 'obsolete'::text])),
	CONSTRAINT "file_change_source_check" CHECK (source = ANY (ARRAY['write_file'::text, 'edit_file'::text, 'execute'::text, 'external'::text, 'review'::text]))
);
--> statement-breakpoint
ALTER TABLE "file_change" ADD CONSTRAINT "file_change_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_change" ADD CONSTRAINT "file_change_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."harness_topic"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_file_change_workspace_status" ON "file_change" USING btree ("workspace_id" int4_ops,"status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_file_change_path_created" ON "file_change" USING btree ("path" text_ops,"created_at" timestamp_ops);