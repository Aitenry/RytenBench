/**
 * 知识图谱 LLM Prompt 模板集中管理（含 few-shot 示例确保输出格式稳定）
 * 输出校验由 Zod + StructuredOutputParser 在 parse 阶段完成
 */

/** 实体消歧合并 Prompt */
export const ENTITY_MERGING_PROMPT = `你是一个知识图谱实体消歧助手。以下是多段文本中抽取出的实体列表。请分析并将指向同一真实事物的实体合并。

实体类型定义（type 必须严格从以下 20 种中选择，禁止自创）：
- person: 人物
- organization: 组织（公司、团队、机构、帮派、宗族、团体）
- concept: 概念/理论
- event: 事件
- location: 地点
- technology: 技术/工具
- product: 产品/项目
- system: 体系/平台/系统（管理体系、IT系统、业务平台）
- document: 文档/证照（合同、许可证、证书、报告）
- standard: 标准/法规/政策（技术标准、行业规范、法律法规）
- facility: 设施/装备（核设施、生产设备、建筑、基础设施）
- substance: 物质/材料（化学物质、放射性核素、原材料、药品）
- process: 流程/工序/方法
- role: 角色/职位/岗位
- skill: 技能/能力
- measure: 指标/度量/参数（KPI、技术指标、监测数据）
- artifact: 物品/装备
- creature: 生物/物种
- realm: 等级/位阶
- other: 其他

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
7. 合并后的 type 取合并前实体的 type 之一，必须从上述 20 种中选择

实体列表：
{entities}

请返回合并后的 JSON 对象，格式如下：
{{
  "merged": [
    {{
      "name": "规范化名称",
      "type": "类型",
      "description": "综合描述",
      "aliases": ["别名1"],
      "confidence": 0.95,
      "source_doc_ids": [1, 2]
    }}
  ],
  "removed_names": ["被合并掉的名称"]
}}

请仅返回 JSON 对象（直接输出对象，不要包裹在代码块中）：`

/** Gleaning（遗漏实体补充抽取）Prompt */
export const ENTITY_GLEANING_PROMPT = `你之前从以下文本中抽取了一些实体。请再仔细检查一遍，找出第一次可能遗漏的实体。
只返回上次未抽取的实体，不要重复已抽取的。

实体类型定义（type 必须严格从以下 20 种中选择，禁止自创）：
- person: 人物
- organization: 组织（公司、团队、机构、帮派、宗族、团体）
- concept: 概念/理论
- event: 事件
- location: 地点
- technology: 技术/工具
- product: 产品/项目
- system: 体系/平台/系统（管理体系、IT系统、业务平台）
- document: 文档/证照（合同、许可证、证书、报告）
- standard: 标准/法规/政策（技术标准、行业规范、法律法规）
- facility: 设施/装备（核设施、生产设备、建筑、基础设施）
- substance: 物质/材料（化学物质、放射性核素、原材料、药品）
- process: 流程/工序/方法
- role: 角色/职位/岗位
- skill: 技能/能力
- measure: 指标/度量/参数（KPI、技术指标、监测数据）
- artifact: 物品/装备
- creature: 生物/物种
- realm: 等级/位阶
- other: 其他

已抽取的实体名称：{existing_entities}

文本内容：
{text}

请仅返回 JSON 数组，每个实体包含 name、type、description、confidence 字段，格式与第一次抽取相同：`

/** 统一实体+关系抽取 Prompt（一次调用同时输出实体和关系） */
export const ENTITY_RELATION_EXTRACTION_PROMPT = `你是一个知识图谱构建助手。请从以下文本中同时抽取出所有有意义的命名实体、关键概念以及实体之间的关系。

实体类型定义（type 必须严格从以下 20 种中选择，禁止自创）：
- person: 人物（个人、角色、虚构角色）
- organization: 组织（公司、团队、机构、帮派、宗族、团体）
- concept: 概念/理论（抽象概念、方法论、设计模式、算法、世界观）
- event: 事件（会议、发布、里程碑、重大节点、战役）
- location: 地点（地理区域、城镇、星球、虚构世界、自然区域）
- technology: 技术/工具（编程语言、框架、库、软件、硬件、协议）
- product: 产品/项目（具体产品、开源项目、应用、作品）
- system: 体系/平台/系统（管理体系、IT系统、业务平台、质量体系、反馈体系）
- document: 文档/证照（合同、许可证、证书、报告、法律文书、审查意见书）
- standard: 标准/法规/政策（技术标准、行业规范、法律法规、政策文件）
- facility: 设施/装备（核设施、生产设备、建筑、基础设施、装置）
- substance: 物质/材料（化学物质、放射性核素、原材料、药品、流出物）
- process: 流程/工序/方法（工作流程、操作步骤、制造工序、方法）
- role: 角色/职位/岗位（岗位名称、职务、角色定义）
- skill: 技能/能力（专业技能、技术能力、天赋、特长、本领）
- measure: 指标/度量/参数（KPI、技术指标、监测参数、统计数据）
- artifact: 物品/装备（武器、防具、工具、重要器物、装备）
- creature: 生物/物种（非人类智慧生物、神话生物、物种）
- realm: 等级/位阶（品级、段位、军衔、职称、称号、层级等）
- other: 其他重要实体

关系类型定义（relation_type 必须严格从以下 24 种中选择，禁止自创）：
- contains: A 包含 B（A 是 B 的容器/集合/模块）
- part_of: A 是 B 的一部分
- is_a: A 是 B 的一种（继承/实例）
- located_in: A 位于 B
- depends_on: A 依赖 B
- related_to: A 与 B 相关（通用关联）
- leads_to: A 导致/产生 B
- uses: A 使用/采用了 B
- creates: A 创造/开发了 B
- produces: A 生产/制造/产出 B
- operates: A 运营/操作/运行 B
- owns: A 拥有/持有 B
- acquires: A 获得/得到 B（物品、技能、资源、许可）
- belongs_to: A 属于/归属于 B（组织、团体、阵营）
- governs: A 管辖/监管/治理 B
- monitors: A 监测/监控/监督 B
- employs: A 雇用/聘用 B
- mentors: A 指导/教导/培训/考核 B
- friend_of: A 与 B 是朋友/盟友/合作伙伴
- enemy_of: A 与 B 是敌人/对手/竞争者
- loves: A 爱慕/喜欢/倾心于 B
- family_of: A 与 B 是亲属/血缘关系
- fights: A 与 B 交战/冲突/对抗
- kills: A 杀死/击败/淘汰 B

实体抽取要求：
1. 只抽取明确出现在文本中的实体，不要凭空猜测
2. 不要抽取过于宽泛或通用的词
3. 实体类型不确定时优先选最接近的类型，无法确定才设为 "other"
4. 每个实体返回 name（规范化全称）、type（类型）、description（15字以内的简洁描述）、confidence（置信度 0-1）
5. confidence 评分标准：0.9-1.0 = 实体名称明确出现且上下文清晰；0.7-0.89 = 实体名称出现但上下文有限；0.5-0.69 = 实体名称模糊或需推断；0-0.49 = 不确定

关系抽取要求：
1. 只返回有明确文本证据支持的关系
2. 关系方向：source → target
3. source 和 target 必须是 entities 列表中的名称（完全匹配）
4. description 简短描述关系（15字内）

示例输入：
"React 是由 Facebook 开发的前端框架，使用 JSX 语法。它在 2013 年开源，目前版本为 18.2。React 的核心是虚拟 DOM 和组件化思想。"

示例输出：
{
  "entities": [
    {"name": "React", "type": "technology", "description": "Facebook开发的前端UI框架", "confidence": 0.95},
    {"name": "Facebook", "type": "organization", "description": "美国科技公司Meta旗下", "confidence": 0.95},
    {"name": "JSX", "type": "technology", "description": "JavaScript语法扩展", "confidence": 0.9},
    {"name": "虚拟DOM", "type": "concept", "description": "轻量级DOM表示优化渲染", "confidence": 0.85},
    {"name": "组件化", "type": "concept", "description": "UI拆分为独立可复用组件", "confidence": 0.85}
  ],
  "relations": [
    {"source": "Facebook", "target": "React", "relation_type": "creates", "description": "Facebook开发并开源了React"},
    {"source": "React", "target": "JSX", "relation_type": "uses", "description": "React采用JSX作为模板语法"},
    {"source": "React", "target": "虚拟DOM", "relation_type": "uses", "description": "React使用虚拟DOM优化渲染"}
  ]
}

文本内容：
{text}

请仅返回 JSON 对象（直接输出对象，不要包裹在代码块中）：`

/** 增量跨块关系补全 Prompt（按 chunk 顺序推进，每次只比较当前 chunk 实体与已处理的前序实体） */
export const INCREMENTAL_CROSS_CHUNK_PROMPT = `你是一个知识图谱关系补全助手。以下 A 组实体出现在文档的前序章节中，B 组实体出现在当前章节中。请找出 A 组与 B 组之间可能存在的关系（A-B 之间、B-B 内部均可，但不要重复 A-A 内部的关系——这些已经抽取完毕）。

文档标题：
{docTitle}

前序章节实体（A 组）：
{previousEntities}

当前章节实体（B 组）：
{currentEntities}

已发现的关系（请勿重复抽取）：
{existingPairs}

关系类型定义（relation_type 必须严格从以下 24 种中选择，禁止使用列表外的任何值）：
- contains: A 包含 B
- part_of: A 是 B 的一部分
- is_a: A 是 B 的一种
- located_in: A 位于 B
- depends_on: A 依赖 B
- related_to: A 与 B 相关
- leads_to: A 导致/产生 B
- uses: A 使用/采用 B
- creates: A 创造/开发 B
- produces: A 生产/制造/产出 B
- operates: A 运营/操作/运行 B
- owns: A 拥有/持有 B
- acquires: A 获得 B
- belongs_to: A 归属于 B
- governs: A 管辖/监管/治理 B
- monitors: A 监测/监控/监督 B
- employs: A 雇用/聘用 B
- mentors: A 指导/教导/培训 B
- friend_of: A 与 B 是朋友/盟友
- enemy_of: A 与 B 是敌人/对手
- loves: A 爱慕 B
- family_of: A 与 B 是亲属
- fights: A 与 B 战斗/对抗
- kills: A 杀死 B

要求：
1. 只返回有合理推断依据的关系
2. 不要重复「已发现的关系」中列出的关系
3. source 和 target 必须是给定实体列表中的名称（完全匹配）
4. description 简短描述关系（15字内）
5. 如果确实没有新的跨章节关系，返回空数组 []

请仅返回 JSON 数组（直接输出数组，不要包裹在代码块中）：`
