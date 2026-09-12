-- 待办正文：description → content
--
-- 待办正文与文档正文同源（Markdown），在待办页内联编辑器里编辑，不再走弹窗的「描述」文本域。
-- 纯列重命名，既有数据整体保留（drizzle-kit 把重命名识别为「删列 + 加列」，其交互式提示在无 TTY 环境
-- 走不通，故按 drizzle 官方 --custom 流程手写本文件，并同步 meta/0001_snapshot.json）。
ALTER TABLE "todo_items" RENAME COLUMN "description" TO "content";
