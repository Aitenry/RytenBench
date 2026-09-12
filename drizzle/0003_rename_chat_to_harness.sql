-- chat → harness 模块改名：四张对话相关表连同索引、外键、唯一约束、CHECK 约束一并改名。
--
-- 只做 RENAME，不重建表：本地 PGlite 数据目录（userData/RytenBenchDB）里已有的话题、
-- 消息、目标与用量数据全部原样保留。表名改完后外键按对象 OID 自动跟随新表，
-- 但索引/约束的名字不会跟着变，所以下面逐个显式改名。
ALTER TABLE "chat_topic" RENAME TO "harness_topic";--> statement-breakpoint
ALTER TABLE "harness_topic" RENAME CONSTRAINT "chat_topic_workspace_id_fkey" TO "harness_topic_workspace_id_fkey";--> statement-breakpoint
ALTER INDEX "chat_topic_pkey" RENAME TO "harness_topic_pkey";--> statement-breakpoint
ALTER INDEX "idx_chat_topic_workspace" RENAME TO "idx_harness_topic_workspace";--> statement-breakpoint
ALTER INDEX "idx_chat_topic_updated_at" RENAME TO "idx_harness_topic_updated_at";--> statement-breakpoint
ALTER TABLE "chat_dialogue" RENAME TO "harness_dialogue";--> statement-breakpoint
ALTER TABLE "harness_dialogue" RENAME CONSTRAINT "chat_dialogue_topic_id_fkey" TO "harness_dialogue_topic_id_fkey";--> statement-breakpoint
ALTER TABLE "harness_dialogue" RENAME CONSTRAINT "chat_dialogue_role_check" TO "harness_dialogue_role_check";--> statement-breakpoint
ALTER INDEX "chat_dialogue_pkey" RENAME TO "harness_dialogue_pkey";--> statement-breakpoint
ALTER INDEX "idx_chat_dialogue_topic" RENAME TO "idx_harness_dialogue_topic";--> statement-breakpoint
ALTER INDEX "idx_chat_dialogue_topic_created" RENAME TO "idx_harness_dialogue_topic_created";--> statement-breakpoint
ALTER TABLE "chat_goals" RENAME TO "harness_goals";--> statement-breakpoint
ALTER TABLE "harness_goals" RENAME CONSTRAINT "chat_goals_phase_check" TO "harness_goals_phase_check";--> statement-breakpoint
ALTER INDEX "chat_goals_pkey" RENAME TO "harness_goals_pkey";--> statement-breakpoint
ALTER INDEX "idx_chat_goals_phase" RENAME TO "idx_harness_goals_phase";--> statement-breakpoint
ALTER TABLE "chat_dialogue_usage" RENAME TO "harness_dialogue_usage";--> statement-breakpoint
ALTER TABLE "harness_dialogue_usage" RENAME CONSTRAINT "chat_dialogue_usage_dialogue_id_key" TO "harness_dialogue_usage_dialogue_id_key";--> statement-breakpoint
ALTER TABLE "harness_dialogue_usage" RENAME CONSTRAINT "chat_dialogue_usage_workspace_id_fkey" TO "harness_dialogue_usage_workspace_id_fkey";--> statement-breakpoint
ALTER TABLE "harness_dialogue_usage" RENAME CONSTRAINT "chat_dialogue_usage_topic_id_fkey" TO "harness_dialogue_usage_topic_id_fkey";--> statement-breakpoint
ALTER TABLE "harness_dialogue_usage" RENAME CONSTRAINT "chat_dialogue_usage_dialogue_id_fkey" TO "harness_dialogue_usage_dialogue_id_fkey";--> statement-breakpoint
ALTER INDEX "chat_dialogue_usage_pkey" RENAME TO "harness_dialogue_usage_pkey";--> statement-breakpoint
ALTER INDEX "idx_chat_dialogue_usage_topic" RENAME TO "idx_harness_dialogue_usage_topic";--> statement-breakpoint
ALTER INDEX "idx_chat_dialogue_usage_workspace" RENAME TO "idx_harness_dialogue_usage_workspace";--> statement-breakpoint
-- 上面改写的是代码里显式声明的索引与约束。PostgreSQL 还会为每个 NOT NULL 列建一条
-- 隐式目录约束（chat_topic_title_not_null 这类），名字由系统生成、代码里没有对应声明，
-- 所以这里按目录扫描统一清掉残留的 chat_ 前缀，而不是硬编码二十多条清单。
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname, conrelid::regclass AS tbl
    FROM pg_constraint
    WHERE contype = 'n' AND connamespace = 'public'::regnamespace AND conname LIKE '%chat\_%'
  LOOP
    EXECUTE format(
      'ALTER TABLE %s RENAME CONSTRAINT %I TO %I',
      r.tbl, r.conname, replace(r.conname, 'chat_', 'harness_')
    );
  END LOOP;
END $$;
