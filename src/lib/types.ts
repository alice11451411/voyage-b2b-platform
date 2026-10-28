/**
 * 领域模型 —— 原 PRD 与 docs/UX_LANGUAGE_AND_FLOW_SPEC.md §7 补充契约。
 */

// ---------- PRD §11 CRM 12 阶段 ----------
export const PIPELINE_STAGES = [
  "Identified",
  "Researched",
  "Qualified",
  "Ready to Contact",
  "Contacted",
  "Replied",
  "Meeting",
  "Sample",
  "Quoted",
  "Negotiation",
  "Won",
  "Lost",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/** 阶段中文标签（界面中文化，枚举值保持英文以对齐 PRD） */
export const STAGE_ZH: Record<PipelineStage, string> = {
  Identified: "待研究",
  Researched: "已研究",
  Qualified: "符合目标",
  "Ready to Contact": "待发送",
  Contacted: "已联系",
  Replied: "已回复",
  Meeting: "已约会议",
  Sample: "寄样跟进",
  Quoted: "已报价",
  Negotiation: "洽谈中",
  Won: "已成交",
  Lost: "已流失",
};

/** 看板分组：把 12 阶段压成可读的列（Lost 单独走归档，不占主看板宽度） */
export const KANBAN_COLUMNS: PipelineStage[][] = [
  ["Identified"],
  ["Researched"],
  ["Qualified"],
  ["Ready to Contact"],
  ["Contacted"],
  ["Replied"],
  ["Meeting"],
  ["Sample"],
  ["Quoted"],
  ["Negotiation"],
  ["Won"],
  ["Lost"],
];

/** 进展统计按独立里程碑事件去重，不推定前序行为。 */
export const FUNNEL_ORDER: PipelineStage[] = [
  "Qualified",
  "Contacted",
  "Replied",
  "Meeting",
  "Quoted",
  "Won",
];

// ---------- PRD §8 Priority ----------
export type Priority = "A" | "B" | "C" | "Disqualified";

export const PRIORITY_RULES: { priority: Priority; min: number; label: string; desc: string }[] = [
  { priority: "A", min: 80, label: "A · 优先联系", desc: "优先研究，不代表已核实采购意愿" },
  { priority: "B", min: 60, label: "B · 补充资料", desc: "补充资料后联系" },
  { priority: "C", min: 40, label: "C · 暂缓培育", desc: "暂缓培育" },
  { priority: "Disqualified", min: 0, label: "暂不联系", desc: "暂时不联系" },
];

export function priorityOf(total: number): Priority {
  if (total >= 80) return "A";
  if (total >= 60) return "B";
  if (total >= 40) return "C";
  return "Disqualified";
}

// ---------- PRD §18 AI 输出格式 ----------
export type FitLevel = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export interface IntentSignal {
  /** 内部值保持英文，界面显示中文；禁止虚构信号。 */
  status: "VERIFIED" | "NO_VERIFIED_SIGNAL";
  evidence: string[];
}

export interface AIAnalysis {
  icp_fit: FitLevel;
  icp_reasons: string[];
  icp_uncertainties: string[];
  product_fit: FitLevel;
  product_fit_reasons: string[];
  /** PRD §6.3：至少 2–4 条事实依据；资料不足时给 INSUFFICIENT DATA */
  opportunity_reasons: string[];
  intent_signal: IntentSignal;
  recommended_hook: string;
  risks: string[];
  missing_information: string[];
}

// ---------- activities（PRD §17 新增独立表） ----------
export type ActivityType =
  | "research"
  | "analysis"
  | "score"
  | "outreach_draft"
  | "approved"
  | "contacted"
  | "reply"
  | "followup"
  | "meeting"
  | "sample"
  | "quote"
  | "stage_change"
  | "won";

export const ACTIVITY_ZH: Record<ActivityType, string> = {
  research: "调研",
  analysis: "AI 分析",
  score: "评分",
  outreach_draft: "邮件草稿",
  approved: "审核通过",
  contacted: "已联系",
  reply: "客户回复",
  followup: "跟进",
  meeting: "会议",
  sample: "寄送样品",
  quote: "报价",
  stage_change: "更新进展",
  won: "成交记录",
};

export interface Activity {
  id: string;
  lead_id: string;
  activity_type: ActivityType;
  content: string;
  created_at: string; // ISO date
  milestone?: PipelineStage;
  stage_from?: PipelineStage;
  stage_to?: PipelineStage;
  draft_id?: string;
}

// ---------- 主表 ----------
export interface Project {
  id: string;
  /** 用户明确保存产品资料的界面状态，不作为对外产品事实。 */
  product_confirmed?: boolean;
  /** 组合开发时保留每款产品的事实边界；成员不再嵌套组合。 */
  selected_products?: Project[];
  company_name: string;
  company_description?: string;
  product_name: string;
  product_category: string;
  description: string;
  advantages: string[];
  certifications: string[];
  moq: string;
  target_country: string;
  target_buyer_type: string;
  created_at: string;
  english_facts?: Record<string, string>;
}

export type CompanyType =
  | "Importer"
  | "Distributor"
  | "Importer / Distributor"
  | "Private Label Brand"
  | "Asian Grocery Chain"
  | "Foodservice Distributor"
  | "Wholesaler"
  | "UNKNOWN";

export const COMPANY_TYPE_ZH: Record<string, string> = {
  Importer: "进口商",
  Distributor: "经销商",
  "Importer / Distributor": "进口商 / 经销商",
  "Private Label Brand": "自有品牌商",
  "Asian Grocery Chain": "亚洲超市连锁",
  "Foodservice Distributor": "餐饮供应链",
  Wholesaler: "批发商",
  UNKNOWN: "待确认",
};

export interface Company {
  /** 共享客户资料的版本与最近更新来源，不代表业务阶段或采购验证。 */
  customer_revision?: number;
  updated_at?: string;
  update_source?: "manual" | "website";
  public_contact_url?: string;
  dataset?: "demo" | "public";
  research_evidence?: { url: string; title: string; snippet: string; retrieved_at: string }[];
  id: string;
  project_id: string;
  company_name: string;
  website: string;
  country: string;
  city: string;
  company_type: CompanyType;
  employee_range: string;
  main_products: string;
  distribution_channel: string;
  research_summary: string;
  data_source: string;
  /** 0–10，喂给评分引擎的 Data Confidence 子项（PRD §7） */
  data_confidence: number;
}

export interface Contact {
  source_url?: string;
  email_status?: "public_unverified";
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  title: string;
  email: string;
  linkedin_url: string;
  /** 0–15，喂给评分引擎的 Decision Maker Quality 子项（PRD §7） */
  decision_maker_score: number;
}

export interface ScoreBreakdown {
  icp_fit: number; // /30
  product_fit: number; // /25
  decision_maker: number; // /15
  intent: number; // /20
  data_confidence: number; // /10
}

export interface Lead {
  revision: number;
  id: string;
  company_id: string;
  contact_id: string;
  scores: ScoreBreakdown;
  total_score: number;
  priority: Priority;
  status: PipelineStage;
  next_followup_date: string | null;
  /** 是否已有通过审核的触达草稿（PRD §10 门禁：Approved 才能进 Ready to Contact） */
  outreach_approved: boolean;
  ai_analysis?: AIAnalysis;
  analysis_meta?: ArtifactMeta;
  score_assessable?: boolean;
}

/** outreach 草稿状态机（PRD §10）*/
export type DraftStatus = "none" | "draft" | "approved" | "sent";

export interface OutreachDraft {
  revision?: number;
  meta?: ArtifactMeta;
  lead_id: string;
  status: DraftStatus;
  subject: string;
  body: string;
  /** 四段式拆解，便于 UI 高亮"AI 依据了哪些真实信息"（PRD §9） */
  parts: { insight: string; relevance: string; proof: string; cta: string };
  generated_at: string;
}

export interface ArtifactMeta {
  source: "local" | "live" | "fallback" | "legacy";
  generated_at: string;
  project_revision: number;
  message?: string;
}

export interface FollowupDraft {
  id: string;
  lead_id: string;
  subject: string;
  body: string;
  status: DraftStatus;
  revision: number;
  value_key: string;
  meta: ArtifactMeta;
}

/** 一家供应商的共享资料；不代表登录账号。 */
export interface BusinessProfile {
  company_name: string;
  description: string;
  confirmed: boolean;
}

/** 每款产品独立保存客户开发记录，不嵌套完整应用状态。 */
export interface ProductWorkspace {
  project: Project;
  project_revision: number;
  icpCriteria: string;
  leads: Lead[];
  drafts: OutreachDraft[];
  activities: Activity[];
  followup_drafts: FollowupDraft[];
}

export interface ProductGroupWorkspace {
  product_ids: string[];
  workspace: ProductWorkspace;
}

/** Demo 数据标注（PRD §20） */
export const DATASET_LABEL = "演示数据";
export const DATASET_DISCLAIMER =
  "演示数据 · 企业与联系人为虚构，不代表真实商业关系；不会真实发信";
