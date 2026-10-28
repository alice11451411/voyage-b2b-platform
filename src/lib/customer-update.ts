import type { DemoState } from "../data/demo.ts";
import type { WebsiteReview } from "./discovery-types.ts";
import { COMPANY_TYPE_ZH, type Company, type Contact, type ProductWorkspace } from "./types.ts";
import { scoreBuyer, synchronizeProduct } from "./workflow.ts";

const companyKeys = ["company_name", "website", "country", "city", "company_type", "employee_range", "main_products", "distribution_channel", "research_summary"] as const;
const contactKeys = ["first_name", "last_name", "title", "email", "linkedin_url"] as const;
export interface CustomerFields {
  company_id: string;
  contact_id: string;
  company: Pick<Company, typeof companyKeys[number]>;
  contact: Pick<Contact, typeof contactKeys[number]>;
}
function records(state: DemoState, id: string) {
  const lead = state.leads.find(l => l.id === id), company = state.companies.find(c => c.id === lead?.company_id), contact = state.contacts.find(c => c.id === lead?.contact_id);
  if (!lead || !company || !contact) throw new Error("没有找到这个客户，请返回客户列表重新选择。");
  return { lead, company, contact };
}
export function customerFields(state: DemoState, id: string): CustomerFields {
  const { company, contact } = records(state, id);
  return { company_id: company.id, contact_id: contact.id, company: Object.fromEntries(companyKeys.map(key => [key, company[key]])) as CustomerFields["company"], contact: Object.fromEntries(contactKeys.map(key => [key, contact[key]])) as CustomerFields["contact"] };
}
export function captureCustomerVersion(state: DemoState, id: string) {
  const { company, contact } = records(state, id);
  return { project_id: state.project.id, selection_revision: state.selection_revision, lead_id: id, company_id: company.id, contact_id: contact.id, signature: JSON.stringify([company, state.contacts.filter(c => c.company_id === company.id)]) };
}
export type CustomerVersion = ReturnType<typeof captureCustomerVersion>;
export function assertCustomerVersion(state: DemoState, token: CustomerVersion) {
  const current = captureCustomerVersion(state, token.lead_id);
  if (current.project_id !== token.project_id || current.selection_revision !== token.selection_revision || current.company_id !== token.company_id || current.contact_id !== token.contact_id || current.signature !== token.signature) throw new Error("客户资料或开发选择已变化，本次内容未覆盖新资料。请关闭编辑并重新打开。");
}
function webUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
/** 网站返回值作为资料，不执行网页中的指令；失败或不完整的响应不能形成可保存预览。 */
export function validateCustomerReview(value: unknown): WebsiteReview {
  if (!value || typeof value !== "object") throw new Error("官网核验结果不完整，请重新读取。");
  const review = value as WebsiteReview;
  if (!webUrl(review.website) || !date(review.reviewed_at) || ![review.company_name, review.country, review.company_type, review.main_products, review.distribution_channel].every(field => typeof field === "string") || !Array.isArray(review.evidence) || !review.evidence.length || !review.evidence.every(e => e && webUrl(e.url) && typeof e.title === "string" && typeof e.snippet === "string" && date(e.retrieved_at)) || !Array.isArray(review.public_emails) || !review.public_emails.every(e => e && typeof e.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email) && webUrl(e.source_url)) || !(review.contact_url === "UNKNOWN" || review.contact_url === "" || webUrl(review.contact_url))) throw new Error("官网核验结果不完整，请重新读取。");
  return review;
}
export function updateCustomer(state: DemoState, id: string, fields: CustomerFields, options: { token?: CustomerVersion; review?: WebsiteReview } = {}, now = new Date()): DemoState {
  if (options.token) assertCustomerVersion(state, options.token);
  const { company: original, contact: previous } = records(state, id);
  if (fields.company_id !== original.id || fields.contact_id !== previous.id) throw new Error("客户资料已变化，请重新打开编辑。");
  const value = (field: string) => field.trim() || "UNKNOWN";
  const company = { ...original }, contact = { ...previous };
  for (const key of companyKeys) {
    if (typeof fields.company[key] !== "string") throw new Error("客户资料格式不完整。");
    if (key !== "company_type") company[key] = value(fields.company[key]);
  }
  if (!fields.company.company_name.trim()) throw new Error("请填写客户公司名称。");
  if (!Object.hasOwn(COMPANY_TYPE_ZH, fields.company.company_type)) throw new Error("请选择客户类型；未知可选待确认。");
  company.company_type = fields.company.company_type;
  if (company.website !== "UNKNOWN" && !webUrl(company.website)) throw new Error("请填写有效的 HTTP 或 HTTPS 公司官网。");
  for (const key of contactKeys) {
    if (typeof fields.contact[key] !== "string") throw new Error("联系人资料格式不完整。");
    contact[key] = value(fields.contact[key]);
  }
  if (contact.email !== "UNKNOWN" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) throw new Error("请填写有效的联系人邮箱，未知可留空。");
  if (contact.linkedin_url !== "UNKNOWN" && !webUrl(contact.linkedin_url)) throw new Error("请填写有效的联系人领英地址，未知可留空。");
  if (contact.email !== previous.email) { delete contact.source_url; delete contact.email_status; }
  if (["first_name", "last_name", "title", "email"].some(key => contact[key as keyof Contact] !== previous[key as keyof Contact]) || original.dataset === "public") contact.decision_maker_score = 0;
  if (options.review) {
    const review = validateCustomerReview(options.review);
    // 网站标题/未知字段不能覆盖人工资料；官网与邮箱由编辑者明确应用到字段。
    if (company.website !== review.website) throw new Error("官网已修改，请重新核验新的地址再保存结果。");
    const evidence = new Map((company.research_evidence ?? []).map(item => [item.url, item]));
    for (const item of review.evidence) evidence.set(item.url, { ...item });
    company.research_evidence = [...evidence.values()];
    if (webUrl(review.contact_url)) company.public_contact_url = review.contact_url;
    const emailEvidence = review.public_emails.find(item => item.email.toLowerCase() === contact.email.toLowerCase());
    if (emailEvidence && original.dataset === "public") { contact.source_url = emailEvidence.source_url; contact.email_status = "public_unverified"; }
  }
  if (JSON.stringify(company) === JSON.stringify(original) && JSON.stringify(contact) === JSON.stringify(previous)) return state;
  company.customer_revision = (original.customer_revision ?? 0) + 1;
  company.updated_at = now.toISOString(); company.update_source = options.review ? "website" : "manual";
  company.data_source = original.dataset === "public" ? "公开官网与人工更新 · 采购意向及邮箱投递尚未核实" : "演示客户 · 人工更新资料，仍属于演示数据";
  if (original.dataset === "public") company.data_confidence = Math.min(10, [company.website, company.country, company.city, company.company_type, company.employee_range, company.main_products, company.distribution_channel, contact.title, contact.email, contact.linkedin_url].filter(field => field && field !== "UNKNOWN").length);
  const synced = synchronizeProduct(state);
  const companies = synced.companies.map(c => c.id === company.id ? company : c), contacts = synced.contacts.map(c => c.id === contact.id ? contact : c);
  function refresh(workspace: ProductWorkspace): ProductWorkspace {
    const related = workspace.leads.filter(l => l.company_id === company.id);
    if (!related.length) return workspace;
    const ids = new Set(related.map(l => l.id));
    return { ...workspace,
      leads: workspace.leads.map(l => !ids.has(l.id) ? l : { ...l, ...scoreBuyer(company, contacts.find(c => c.id === l.contact_id)!, workspace.project), revision: l.revision + 1, ai_analysis: undefined, analysis_meta: undefined, outreach_approved: workspace.drafts.some(d => d.lead_id === l.id && d.status === "sent"), status: l.status === "Ready to Contact" ? "Qualified" : l.status }),
      drafts: workspace.drafts.map(d => !ids.has(d.lead_id) || d.status === "sent" ? d : { ...d, status: "draft", revision: (d.revision ?? 0) + 1 }),
      followup_drafts: workspace.followup_drafts.map(d => !ids.has(d.lead_id) || d.status === "sent" ? d : { ...d, status: "draft", revision: d.revision + 1 }),
      activities: [...workspace.activities, ...related.map(l => ({ id: crypto.randomUUID(), lead_id: l.id, activity_type: "research" as const, content: options.review ? "人工确认官网更新资料；已重新计算评分，未发送邮件需重新审核。" : "人工更新共享客户资料；已重新计算评分，未发送邮件需重新审核。", created_at: now.toISOString() }))],
    };
  }
  const products = synced.products.map(refresh), product_groups = synced.product_groups.map(g => ({ ...g, workspace: refresh(g.workspace) }));
  const active = products.find(p => p.project.id === synced.project.id) ?? product_groups.find(g => g.workspace.project.id === synced.project.id)!.workspace;
  return { ...synced, ...active, companies, contacts, products, product_groups };
}
