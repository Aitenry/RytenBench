ALTER TABLE "llm_providers" ADD COLUMN "top_p" real;--> statement-breakpoint
ALTER TABLE "llm_providers" ADD COLUMN "top_k" integer;--> statement-breakpoint
ALTER TABLE "llm_providers" ADD COLUMN "thinking_mode" text DEFAULT 'auto';--> statement-breakpoint
ALTER TABLE "llm_providers" ADD COLUMN "max_tool_rounds" integer DEFAULT 500;