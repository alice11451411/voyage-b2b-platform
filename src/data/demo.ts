import type { Activity, BusinessProfile, Company, CompanyType, Contact, FollowupDraft, Lead, OutreachDraft, PipelineStage, ProductGroupWorkspace, ProductWorkspace, Project } from "../lib/types.ts";
import { scoreBuyer } from "../lib/workflow.ts";

export interface DemoState {
  schema_version: 2;
  scoring_version: 2;
  catalog_version: 1;
  business_profile: BusinessProfile;
  products: ProductWorkspace[];
  product_groups: ProductGroupWorkspace[];
  selection_revision: number;
  project_revision: number;
  followup_drafts: FollowupDraft[];
  project: Project;
  companies: Company[];
  contacts: Contact[];
  leads: Lead[];
  activities: Activity[];
  drafts: OutreachDraft[];
  icpCriteria: string;
}

type ResearchFact = { icp: "Strong" | "Medium" | "Weak" | "No Fit"; productFit: number; intent: number; evidence: string[]; intentEvidence: string[] };
type BuyerSeed = [name: string, city: string, type: CompanyType, products: string, channel: string, title: string, icp: ResearchFact["icp"], fit: number, intent: number, confidence: number];
const buyers: BuyerSeed[] = [
  ["Pacific Pantry Imports", "Los Angeles, CA", "Importer / Distributor", "Hotpot bases, chili sauces, Asian seasonings", "Asian grocery stores and regional wholesalers", "Head of Purchasing", "Strong", 25, 10, 9],
  ["Golden Bridge Foods", "New York, NY", "Distributor", "Asian sauces, soup bases, specialty groceries", "East Coast Asian supermarkets", "Category Director", "Strong", 22, 10, 9],
  ["Lotus Shelf Brands", "Austin, TX", "Private Label Brand", "Private label chili sauces and cooking sauces", "Retail private label and online grocery", "Sourcing Manager", "Strong", 25, 0, 8],
  ["Harbor Wok Supply", "Seattle, WA", "Importer", "Chinese condiments, hotpot bases, dried ingredients", "Independent Asian grocery stores", "Procurement Manager", "Strong", 25, 0, 9],
  ["Red Lantern Markets", "San Francisco, CA", "Asian Grocery Chain", "Asian sauces, frozen food, hotpot ingredients", "Regional Asian grocery chain", "Category Buyer", "Strong", 24, 0, 8],
  ["Jade Route Distribution", "Chicago, IL", "Distributor", "Chinese sauces, noodles, seasoning blends", "Midwest grocery and foodservice", "Purchasing Director", "Strong", 23, 0, 8],
  ["Eastfield Asian Imports", "Houston, TX", "Importer / Distributor", "Hotpot bases, chili oil, Chinese pantry products", "Asian grocery and restaurant supply", "Head of Purchasing", "Strong", 25, 10, 9],
  ["Riverstone Pantry", "Boston, MA", "Importer", "Asian cooking sauces, soup mixes", "Specialty grocery retailers", "Sourcing Manager", "Medium", 23, 0, 8],
  ["Mosaic Table Brands", "Portland, OR", "Private Label Brand", "OEM cooking sauces, Asian seasoning blends", "Private label grocery brands", "Founder", "Strong", 25, 0, 8],
  ["Sunrise Basket Stores", "San Diego, CA", "Asian Grocery Chain", "Chili sauces, dry groceries, noodles", "Local Asian supermarkets", "Category Buyer", "Strong", 22, 0, 7],
  ["Cedar Kitchen Supply", "Denver, CO", "Foodservice Distributor", "Soup stocks, general seasonings, restaurant staples", "Restaurants and catering kitchens", "Purchasing Coordinator", "Weak", 15, 0, 7],
  ["Orchard Coast Wholesale", "Miami, FL", "Wholesaler", "International condiments and shelf-stable groceries", "Independent grocery retailers", "Buyer", "Medium", 15, 0, 6],
  ["Blue Mesa Provisions", "Phoenix, AZ", "Distributor", "General snacks, beverages, cooking sauces", "Convenience and specialty retail", "Operations Manager", "Weak", 15, 0, 6],
  ["Maple Grain Wholesale", "Minneapolis, MN", "Wholesaler", "Baking flour, grains, dry staples", "Bakeries and general food wholesalers", "Customer Service", "No Fit", 5, 0, 4],
  ["Bright Fork Essentials", "Atlanta, GA", "Private Label Brand", "Breakfast cereals, sweet snacks", "Online retail", "UNKNOWN", "No Fit", 5, 0, 4],
  ["Silver Bay Cold Chain", "Dallas, TX", "Foodservice Distributor", "Frozen seafood and ice cream", "Cold chain foodservice", "Sales Representative", "No Fit", 0, 0, 5],
];

export const researchFacts: Record<string, ResearchFact> = Object.fromEntries(buyers.map((buyer, index) => [
  `company-${index + 1}`,
  {
    icp: buyer[6], productFit: buyer[7], intent: buyer[8],
    evidence: [`模拟资料 · Demo Dataset：经营品类为 ${buyer[3]}。`, `模拟资料 · Demo Dataset：渠道为 ${buyer[4]}。`],
    intentEvidence: buyer[8] ? [`模拟时机信号 · Demo Dataset：${buyer[0]} 的演示采购计划中包含亚洲调味品品类评估，未经真实核验。`] : [],
  },
]));

export function createDemoState(now = new Date()): DemoState {
  const dateAt = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();
  const project: Project = {
    product_confirmed: false,
    id: "project-demo", company_name: "川味食品制造 · 演示企业", product_name: "火锅底料 / Hotpot Soup Base", product_category: "Asian seasonings / 亚洲复合调味料",
    description: "为海外亚洲食品渠道提供火锅底料、辣酱与 OEM 调味料。企业及产品资料均为演示设定。", advantages: ["多种辣度与口味", "支持 OEM 包装", "提供小批量选品方案"], certifications: [], moq: "每 SKU 1,000 袋（演示设定）",
    target_country: "United States", target_buyer_type: "Asian Food Importer / Distributor / Private Label Brand / Asian Grocery Chain", created_at: dateAt(-28),
  };
  const companies: Company[] = buyers.map((b, i) => ({
    dataset: "demo",
    id: `company-${i + 1}`, project_id: project.id, company_name: b[0], website: `https://${b[0].toLowerCase().replaceAll(" ", "-")}.example`, country: "United States", city: b[1], company_type: b[2], employee_range: i < 10 ? "20–100" : "10–50", main_products: b[3], distribution_channel: b[4], research_summary: `演示公司，模拟经营 ${b[3]}，通过 ${b[4]} 分销；尚未开展真实核验。`, data_source: "Demo Dataset · 虚构企业与模拟资料", data_confidence: b[9],
  }));
  const firstNames = ["Alex", "Grace", "Taylor", "Morgan", "Jamie", "Jordan", "Chris", "Sam", "Casey", "Riley", "Avery", "Blake", "Drew", "Robin", "UNKNOWN", "Quinn"];
  const contacts: Contact[] = buyers.map((b, i) => ({
    id: `contact-${i + 1}`, company_id: companies[i].id, first_name: firstNames[i], last_name: i === 14 ? "UNKNOWN" : "Chen", title: b[5], email: i === 14 ? "UNKNOWN" : `buying@${companies[i].website.replace("https://", "")}`, linkedin_url: "UNKNOWN", decision_maker_score: /Director|Head|Founder/.test(b[5]) ? 15 : /Manager|Buyer/.test(b[5]) ? 12 : /Coordinator/.test(b[5]) ? 9 : 3,
  }));
  const statuses: Lead["status"][] = ["Quoted", "Meeting", "Replied", "Contacted", "Contacted", "Contacted", "Ready to Contact", "Qualified", "Qualified", "Qualified", "Researched", "Researched", "Identified", "Identified", "Identified", "Lost"];
  const leads: Lead[] = companies.map((company, i) => ({
    revision: 0,
    id: `lead-${i + 1}`, company_id: company.id, contact_id: contacts[i].id, ...scoreBuyer(company, contacts[i], project), status: statuses[i], next_followup_date: i >= 3 && i <= 5 ? dateAt(i === 3 ? -2 : i === 4 ? 1 : 2) : null, outreach_approved: i < 7,
  }));
  const activities: Activity[] = [];
  const add = (lead: Lead, activity_type: Activity["activity_type"], days: number, content: string, milestone?: PipelineStage) => activities.push({ id: `seed-${activities.length + 1}`, lead_id: lead.id, activity_type, created_at: dateAt(days), content, milestone });
  leads.forEach((lead, i) => {
    add(lead, "research", -25 + i, "演示历史：已查看并整理客户资料。", i < 10 ? "Qualified" : "Researched");
    if (i < 7) add(lead, "approved", -16 + i, "演示历史：人工审核通过。");
    if (i < 6) add(lead, "contacted", i < 3 ? -14 + i : i === 3 ? -5 : i === 4 ? -2 : -1, "演示历史：模拟邮件已发送，未真实外发。", "Contacted");
    if (i < 3) add(lead, "reply", -9 + i, "演示历史：客户回复，希望了解选品资料。", "Replied");
    if (i < 2) add(lead, "meeting", -5 + i, "演示历史：约定产品沟通会议。", "Meeting");
    if (i === 0) add(lead, "quote", -2, "演示历史：发送人工准备的参考报价。", "Quoted");
  });
  const drafts: OutreachDraft[] = leads.slice(0, 7).map((lead, i) => {
    const parts = { insight: `Your company profile lists ${companies[i].main_products}.`, relevance: "Our hotpot bases and Asian seasoning range may complement this category.", proof: "Our supplied product information includes multiple spice levels and OEM packaging. Specifications require confirmation.", cta: "If this category is on your sourcing plan, may I share a few SKUs for reference?" };
    return { lead_id: lead.id, revision: 0, meta: { source: "local", project_revision: 0, generated_at: dateAt(-18 + i) }, status: i < 6 ? "sent" : "approved", subject: "Hotpot seasoning options for your Asian food range", body: Object.values(parts).join("\n\n"), parts, generated_at: dateAt(-18 + i) };
  });
  const workspace: ProductWorkspace = { project, project_revision: 0, followup_drafts: [], leads, activities, drafts, icpCriteria: "美国市场；亚洲食品进口商、经销商、自有品牌或亚洲超市；经营调味品且有可确认的采购角色。" };
  return { schema_version: 2, scoring_version: 2, catalog_version: 1, business_profile: { company_name: project.company_name, description: "", confirmed: false }, products: [workspace], product_groups: [], selection_revision: 0, companies, contacts, ...workspace };
}
