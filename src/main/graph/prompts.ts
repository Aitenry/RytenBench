/**
 * 知识图谱 LLM Prompt 模板集中管理
 * 优化：添加 few-shot 示例，使用结构化输出指令，减少 token 消耗
 */

/** 实体抽取 Prompt（含 few-shot 示例） */
export const ENTITY_EXTRACTION_PROMPT = `你是一个知识图谱实体抽取助手。请从以下文本中抽取出所有有意义的命名实体和关键概念。

实体类型定义：
- person: 人物（个人、角色）
- organization: 组织（公司、团队、机构、项目组）
- technology: 技术/工具（编程语言、框架、库、软件、硬件、协议）
- concept: 概念/理论（抽象概念、方法论、设计模式、算法）
- event: 事件（会议、发布、里程碑）
- location: 地点（地理区域、数据中心）
- product: 产品/项目（具体产品、开源项目、应用）
- other: 其他重要实体

要求：
1. 只抽取明确出现在文本中的实体，不要凭空猜测
2. 每个实体返回 name（规范化全称）、type（类型）、description（15字以内的简洁描述）
3. 不要抽取过于宽泛或通用的词（如"系统"、"数据"、"功能"等常见术语）
4. 如果实体类型不确定，设为 "other"
5. 请以严格的 JSON 数组格式返回，不要包含任何其他内容

示例输入：
"React 是由 Facebook 开发的前端框架，使用 JSX 语法。它在 2013 年开源，目前版本为 18.2。React 的核心是虚拟 DOM 和组件化思想。"

示例输出：
[
  {"name": "React", "type": "technology", "description": "Facebook开发的前端UI框架"},
  {"name": "Facebook", "type": "organization", "description": "美国科技公司Meta旗下"},
  {"name": "JSX", "type": "technology", "description": "JavaScript语法扩展"},
  {"name": "虚拟DOM", "type": "concept", "description": "轻量级DOM表示优化渲染"},
  {"name": "组件化", "type": "concept", "description": "UI拆分为独立可复用组件"}
]

文本内容：
{text}

请仅返回 JSON 数组（直接输出数组，不要包裹在代码块中）：`

/** 实体消歧合并 Prompt */
export const ENTITY_MERGING_PROMPT = `你是一个知识图谱实体消歧助手。以下是多段文本中抽取出的实体列表。请分析并将指向同一真实事物的实体合并。

合并规则：
1. 名称完全相同 → 直接合并（调用方已处理，此处不需重复合并）
2. 名称不同但明确指代同一实体 → 选择最规范/最常用的名称作为主名，其余作为别名
   - "React" 和 "React.js" → 合并为 "React"，别名 ["React.js"]
   - "Kubernetes" 和 "K8s" → 合并为 "Kubernetes"，别名 ["K8s"]
   - "大语言模型" 和 "LLM" → 合并为 "大语言模型"，别名 ["LLM"]
   - "VS Code" 和 "Visual Studio Code" → 合并为 "Visual Studio Code"，别名 ["VS Code"]
3. 中文/英文名称指代同一事物 → 选择最常用的表达作为主名
4. 如果无法确定是否同一实体 → 保留各自独立
5. 合并后的 description 保留最详细的描述
6. 合并后的 confidence 取最大值

实体列表：
{entities}

请返回合并后的 JSON 对象，格式如下：
{
  "merged": [
    {
      "name": "规范化名称",
      "type": "类型",
      "description": "综合描述",
      "aliases": ["别名1"],
      "confidence": 0.95,
      "source_note_ids": [1, 2]
    }
  ],
  "removed_names": ["被合并掉的名称"]
}

请仅返回 JSON 对象（直接输出对象，不要包裹在代码块中）：`

/** 关系抽取 Prompt（含 few-shot 示例） */
export const RELATION_EXTRACTION_PROMPT = `你是一个知识图谱关系抽取助手。给定实体列表和原始文本，请抽取实体之间存在的关系。

关系类型定义：
- depends_on: A 依赖 B（A 的运行/使用需要 B）
- contains: A 包含 B（A 是 B 的容器/集合/模块）
- part_of: B 包含 A（A 是 B 的一部分）
- related_to: A 与 B 相关（通用关联）
- creates: A 创造/开发了 B
- uses: A 使用/采用了 B
- is_a: A 是 B 的一种（继承/实例）
- leads_to: A 导致/产生 B

要求：
1. 只返回有明确文本证据支持的关系
2. 关系方向：source → target
3. source 和 target 必须是给定实体列表中的名称（完全匹配）
4. description 简短描述关系（15字内）

示例输入：
实体列表：["React", "Facebook", "JSX", "虚拟DOM"]
文本："React 由 Facebook 于 2013 年开源。React 使用 JSX 语法和虚拟 DOM 优化渲染性能。"

示例输出：
[
  {"source": "Facebook", "target": "React", "relation_type": "creates", "description": "Facebook开发并开源了React"},
  {"source": "React", "target": "JSX", "relation_type": "uses", "description": "React采用JSX作为模板语法"},
  {"source": "React", "target": "虚拟DOM", "relation_type": "uses", "description": "React使用虚拟DOM优化渲染"}
]

实体列表：
{entities}

文本内容：
{text}

请仅返回 JSON 数组（直接输出数组，不要包裹在代码块中）：`

/** Gleaning（遗漏实体补充抽取）Prompt */
export const ENTITY_GLEANING_PROMPT = `你之前从以下文本中抽取了一些实体。请再仔细检查一遍，找出第一次可能遗漏的实体。
只返回上次未抽取的实体，不要重复已抽取的。

已抽取的实体名称：{existing_entities}

文本内容：
{text}

请仅返回 JSON 数组，格式与之前相同：`
