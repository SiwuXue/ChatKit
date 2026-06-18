/**
 * 提示词模板数据 + 变量替换 + 用户配置存储
 * 参考 test/lanren.js
 */

export interface PromptTemplate {
  name: string
  prompt: string
}

export interface PromptCategory {
  category: string
  items: PromptTemplate[]
}

export interface UserConfig {
  location: string
  identity: string
  budget: string
  interests: string
}

export interface CustomPrompt {
  name: string
  prompt: string
}

const DEFAULT_CONFIG: UserConfig = {
  location: "上海市",
  identity: "大学生",
  budget: "有限",
  interests: "美食、旅行、拍照",
}

const STORAGE_KEY = "prompt-user-config-v1"

// ── 提示词模板（来自 lanren.js）──

export const PROMPT_CATEGORIES: PromptCategory[] = [
  {
    category: "文案写作",
    items: [
      {
        name: "小红书文案",
        prompt: `请帮我写一篇小红书风格的文案，主题是【在这里输入你的主题】。

我的信息：
- 地点：{{CURRENT_LOCATION}}
- 时间：{{CURRENT_DATE}}
- 身份：{{USER_IDENTITY}}

要求：
- 标题吸睛，带emoji表情
- 语言活泼亲切，使用网络流行语
- 结构清晰，有干货分享
- 结尾引导互动
- 字数控制在300-500字

请按照以下格式输出：
🎀 标题：
✨ 正文：
💡 小贴士：
👇 互动：`,
      },
      {
        name: "公众号推文",
        prompt: `请帮我写一篇公众号推文，主题是【在这里输入你的主题】。

我的信息：
- 地点：{{CURRENT_LOCATION}}
- 时间：{{CURRENT_DATE}}
- 身份：{{USER_IDENTITY}}

要求：
- 标题要有吸引力，符合微信生态
- 开头要有钩子，引发兴趣
- 内容有价值，结构清晰
- 结尾有引导关注和互动
- 字数控制在1500-2000字

请提供完整的推文内容，包括配图建议。`,
      },
      {
        name: "产品文案",
        prompt: `请帮我为【产品名称】写一段产品文案。

产品信息：【请描述产品特点、功能、优势】
目标人群：【目标用户群体】
我的身份：{{USER_IDENTITY}}

要求：
- 突出产品核心卖点
- 语言简洁有力
- 激发购买欲望
- 适合电商平台使用

请提供：1) 主标题 2) 副标题 3) 核心卖点（3-5点） 4) 行动号召语`,
      },
      {
        name: "活动海报文案",
        prompt: `请帮我写一个活动海报文案，活动主题是【活动名称】。

活动详情：
- 时间：【活动时间】
- 地点：【活动地点】（默认{{CURRENT_LOCATION}}）
- 参与人群：【目标人群】
- 活动亮点：【3-5个亮点】

风格要求：【文艺/活泼/高端/简约】

请提供：主标题、副标题、活动信息、亮点列表、行动号召语。`,
      },
    ],
  },
  {
    category: "工作办公",
    items: [
      {
        name: "写周报",
        prompt: `请帮我写一份{{CURRENT_YEAR}}年{{CURRENT_MONTH}}月的工作周报。

我的信息：
- 身份：{{USER_IDENTITY}}
- 时间：{{CURRENT_DATE}}

本周工作内容：
【请输入本周完成的工作】

下周计划：
【请输入下周工作计划】

遇到的问题：
【如有问题请输入】

要求：
- 格式清晰，分点列出
- 语言专业简洁
- 突出工作成果和价值
- 字数控制在500-800字`,
      },
      {
        name: "写邮件",
        prompt: `请帮我写一封邮件。

邮件类型：【工作汇报/商务合作/请假申请/其他】
收件人：【收件人姓名/职位】
主题：【邮件主题】
我的身份：{{USER_IDENTITY}}

邮件内容要点：
【请输入邮件主要内容】

要求：
- 格式规范，专业得体
- 语言简洁明了
- 语气恰当
- 包含必要的称呼和落款`,
      },
      {
        name: "会议纪要",
        prompt: `请帮我整理会议纪要。

会议主题：【会议主题】
会议时间：{{CURRENT_TIME}}
参会人员：【姓名列表】

会议内容要点：
【请输入会议讨论内容】

决议事项：
【请输入会议决定】

后续行动：
【请输入待办事项及负责人】

要求：格式清晰，便于跟踪执行。`,
      },
      {
        name: "PPT大纲",
        prompt: `请帮我设计一份PPT大纲，主题是【主题名称】。

目标受众：【目标人群】
核心目的：【演示目的】
预计时长：【演示时间】
我的身份：{{USER_IDENTITY}}

要求：
- 结构清晰，逻辑严谨
- 建议页数：10-15页
- 包含封面、目录、内容页、总结
- 每页简要说明内容要点`,
      },
    ],
  },
  {
    category: "编程开发",
    items: [
      {
        name: "写代码",
        prompt: `请帮我写一段代码。

需求描述：
【请详细描述你的需求】

技术栈：
【请指定编程语言和框架】

要求：
- 代码结构清晰
- 添加必要的注释
- 提供测试用例（如果适用）
- 说明使用方法`,
      },
      {
        name: "代码审查",
        prompt: `请帮我审查这段代码。

代码内容：
【请粘贴你的代码】

审查关注点：
- 代码质量和规范性
- 潜在的bug和性能问题
- 安全性问题
- 代码优化建议

请给出详细的审查意见和改进建议。`,
      },
      {
        name: "技术方案",
        prompt: `请帮我设计一个技术方案。

需求背景：
【请描述业务需求】

技术约束：
【请说明技术限制条件】

需要设计的内容：
- 架构设计
- 技术选型
- 数据库设计
- API接口设计
- 关键流程图

请提供详细的技术方案文档。`,
      },
      {
        name: "Bug排查",
        prompt: `请帮我排查一个Bug。

问题描述：
【请详细描述问题现象】

出现场景：
【请说明触发条件】

相关代码：
【请粘贴相关代码】

已经尝试的解决方法：
【请说明已尝试的方案】

请分析可能的原因并给出解决方案。`,
      },
    ],
  },
  {
    category: "学习教育",
    items: [
      {
        name: "写论文",
        prompt: `请帮我写一篇学术论文，主题是【论文主题】。

我的信息：
- 身份：{{USER_IDENTITY}}
- 时间：{{CURRENT_DATE}}

论文类型：【本科/硕士/期刊论文】
学科领域：【学科名称】
字数要求：【具体字数】

要求：
- 结构完整（摘要、引言、正文、结论、参考文献）
- 逻辑严谨，论证充分
- 引用格式规范
- 提供参考文献列表`,
      },
      {
        name: "知识点总结",
        prompt: `请帮我总结【知识点名称】的核心内容。

我的身份：{{USER_IDENTITY}}

要求：
- 条理清晰，分点列出
- 突出重点和难点
- 包含关键概念和公式
- 适合快速复习
- 可配合思维导图结构`,
      },
      {
        name: "学习计划",
        prompt: `请帮我制定一份学习计划。

学习目标：【目标描述】
时间周期：【学习时长】
现有基础：【当前水平】
我的身份：{{USER_IDENTITY}}

要求：
- 合理安排学习进度
- 包含具体学习内容
- 设定阶段性目标
- 提供学习资源建议
- 包含复习和练习安排`,
      },
      {
        name: "解题思路",
        prompt: `请帮我分析这道题目。

题目内容：
【请粘贴题目】

我的身份：{{USER_IDENTITY}}

要求：
- 分析解题思路
- 提供详细解答步骤
- 解释关键知识点
- 给出举一反三的建议
- 说明易错点`,
      },
    ],
  },
  {
    category: "生活娱乐",
    items: [
      {
        name: "周末去哪玩",
        prompt: `请帮我推荐{{CURRENT_LOCATION}}周末好玩的地方。

我的信息：
- 时间：{{CURRENT_DATE}}（{{CURRENT_WEEKDAY}}）
- 地点：{{CURRENT_LOCATION}}
- 身份：{{USER_IDENTITY}}
- 预算：{{USER_BUDGET}}
- 兴趣：{{USER_INTERESTS}}

要求：推荐 3-5 个地方，要有逼格，要省钱，要适合拍照发朋友圈。`,
      },
      {
        name: "本地美食",
        prompt: `请帮我推荐{{CURRENT_LOCATION}}的特色美食。

我的信息：
- 地点：{{CURRENT_LOCATION}}
- 身份：{{USER_IDENTITY}}
- 预算：{{USER_BUDGET}}
- 兴趣：{{USER_INTERESTS}}

要求：
- 推荐本地特色菜系和必吃餐厅
- 考虑{{TIME_PERIOD}}用餐场景
- 适合{{USER_BUDGET}}预算
- 推荐3-5家餐厅及招牌菜`,
      },
      {
        name: "旅行攻略",
        prompt: `请帮我规划一次旅行。

目的地：【城市/景点名称】
旅行天数：【天数】
出行时间：【季节/月份】
我的出发地：{{CURRENT_LOCATION}}
我的预算：{{USER_BUDGET}}
我的兴趣：{{USER_INTERESTS}}
同行人数：【人数】

要求：
- 详细行程安排（每天）
- 必去景点推荐
- 美食推荐
- 交通住宿建议
- 注意事项和旅行小贴士`,
      },
      {
        name: "菜谱推荐",
        prompt: `请帮我推荐一些菜谱。

我的信息：
- 地点：{{CURRENT_LOCATION}}
- 身份：{{USER_IDENTITY}}
- 预算：{{USER_BUDGET}}

需求：
- 菜系偏好：【中/西/日/韩/其他，默认为{{CURRENT_LOCATION}}本地菜】
- 烹饪难度：【简单/中等/复杂】
- 食材限制：【素食/无辣/海鲜/其他】
- 用餐场景：【早餐/午餐/晚餐/聚会】

请提供3-5个菜谱，包含：
- 菜名
- 所需食材（份量）
- 详细做法步骤
- 烹饪小贴士`,
      },
      {
        name: "礼物推荐",
        prompt: `请帮我推荐一份礼物。

送礼对象：【父母/朋友/恋人/同事】
年龄范围：【年龄段】
兴趣爱好：【兴趣描述，默认{{USER_INTERESTS}}】
预算范围：【预算金额，默认{{USER_BUDGET}}】
送礼场合：【生日/节日/纪念日/其他】
我的身份：{{USER_IDENTITY}}

请推荐3-5个合适的礼物，并说明推荐理由和购买建议。`,
      },
    ],
  },
]

// ── 时间信息 ──

function getCurrentTimeInfo() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const weekDay = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][now.getDay()]
  const hour = now.getHours()

  let timePeriod = ""
  if (hour >= 6 && hour < 9) timePeriod = "早晨"
  else if (hour >= 9 && hour < 12) timePeriod = "上午"
  else if (hour >= 12 && hour < 14) timePeriod = "中午"
  else if (hour >= 14 && hour < 18) timePeriod = "下午"
  else if (hour >= 18 && hour < 22) timePeriod = "晚上"
  else timePeriod = "深夜"

  return {
    year,
    month,
    day,
    weekDay,
    hour,
    timePeriod,
    full: now.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
    date: `${year}年${month}月${day}日`,
    time: `${hour}:${now.getMinutes().toString().padStart(2, "0")}`,
  }
}

// ── 变量替换 ──

export function replaceVariables(text: string, config: UserConfig): string {
  const time = getCurrentTimeInfo()

  const variables: Record<string, string | number> = {
    CURRENT_TIME: time.full,
    CURRENT_YEAR: time.year,
    CURRENT_MONTH: time.month,
    CURRENT_DAY: time.day,
    CURRENT_WEEKDAY: time.weekDay,
    CURRENT_HOUR: time.hour,
    TIME_PERIOD: time.timePeriod,
    CURRENT_DATE: time.date,

    CURRENT_LOCATION: config.location,
    USER_IDENTITY: config.identity,
    USER_BUDGET: config.budget,
    USER_INTERESTS: config.interests,
  }

  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (key in variables) return String(variables[key])
    return match
  })
}

// ── 用户配置持久化 ──

export async function loadConfig(): Promise<UserConfig> {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEY)
    if (result[STORAGE_KEY]) {
      return { ...DEFAULT_CONFIG, ...result[STORAGE_KEY] }
    }
  } catch {
    // chrome.storage 不可用时返回默认值
  }
  return { ...DEFAULT_CONFIG }
}

export async function saveConfig(config: UserConfig): Promise<void> {
  try {
    await chrome.storage.sync.set({ [STORAGE_KEY]: config })
  } catch {
    // 静默失败
  }
}

// ── 自定义提示词持久化 ──

const CUSTOM_PROMPTS_KEY = "custom-prompts-v1"

export async function loadCustomPrompts(): Promise<CustomPrompt[]> {
  try {
    const result = await chrome.storage.sync.get(CUSTOM_PROMPTS_KEY)
    if (result[CUSTOM_PROMPTS_KEY] && Array.isArray(result[CUSTOM_PROMPTS_KEY])) {
      return result[CUSTOM_PROMPTS_KEY]
    }
  } catch {
    // chrome.storage 不可用时返回空数组
  }
  return []
}

export async function saveCustomPrompts(prompts: CustomPrompt[]): Promise<void> {
  try {
    await chrome.storage.sync.set({ [CUSTOM_PROMPTS_KEY]: prompts })
  } catch {
    // 静默失败
  }
}
