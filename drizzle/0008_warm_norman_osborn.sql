-- 0008：模型级「推理等级」列（none/minimal/low/medium/high/xhigh/max，协议原值小写）。
-- 留空(null) = 未设置，不下发档位参数（走模型默认）；可选档位来自模型档案
-- capabilities.reasoning_effort_levels，由主进程按协议族翻译成各家字段
-- （OpenAI 兼容族 reasoning_effort / OpenRouter reasoning.effort /
--  Anthropic output_config.effort / Gemini thinkingConfig.thinkingLevel / Ollama think）。
ALTER TABLE "llm_providers" ADD COLUMN "reasoning_effort" text;
