"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PIPELINE_STAGES, STAGE_ZH, type Company } from "@/lib/types";
import { channelLabel, cityLabel, companyTypeLabel, countryLabel, jobTitleLabel, productsLabel, priorityLabel } from "@/lib/display";
import { getNextAction } from "@/lib/workflow";
import { useCustomerWorkspace } from "./demo-provider";
import { Icon } from "./icons";
import { PublicDiscovery } from "./public-discovery";
import { CustomerEditor } from "./customer-editor";
import { CompanyAvatar, EmptyState, LinkButton, PageHeading, PriorityBadge, StageBadge } from "./ui";

function BuyerWorkspace() {
  const { state, datasetMode } = useCustomerWorkspace();
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get("priority");
  const priority = selected && ["A", "B", "C", "Disqualified"].includes(selected) ? selected : "all";
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [companyType, setCompanyType] = useState("all");
  const [sort, setSort] = useState("desc");
  const [editing, setEditing] = useState<string | null>(null);
  const rows = state.leads.flatMap((lead) => {
    const company = state.companies.find((entry) => entry.id === lead.company_id);
    const contact = state.contacts.find((entry) => entry.id === lead.contact_id);
    return company && contact ? [{ lead, company, contact, action: getNextAction(state, lead) }] : [];
  });
  const search = query.trim().toLowerCase();
  const filtered = rows.filter(({ lead, company, contact }) =>
    (priority === "all" || (lead.score_assessable !== false && lead.priority === priority)) &&
    (status === "all" || lead.status === status) &&
    (companyType === "all" || company.company_type === companyType) &&
    [company.company_name, company.city, cityLabel(company.city), company.country, countryLabel(company.country), company.company_type, companyTypeLabel(company.company_type), company.main_products, productsLabel(company.main_products), company.distribution_channel, channelLabel(company.distribution_channel), contact.first_name, contact.last_name, contact.title, jobTitleLabel(contact.title), contact.email, STAGE_ZH[lead.status]].join(" ").toLowerCase().includes(search),
  ).sort((a, b) => {
    if (a.lead.score_assessable === false && b.lead.score_assessable !== false) return 1;
    if (b.lead.score_assessable === false && a.lead.score_assessable !== false) return -1;
    return sort === "desc" ? b.lead.total_score - a.lead.total_score : a.lead.total_score - b.lead.total_score;
  });
  const activeFilters = query || priority !== "all" || status !== "all" || companyType !== "all";
  function setPriority(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "all") next.delete("priority"); else next.set("priority", value);
    router.replace(`/buyers${next.size ? `?${next}` : ""}`, { scroll: false });
  }
  function clearFilters() { setQuery(""); setPriority("all"); setStatus("all"); setCompanyType("all"); }
  function recommendation(lead: typeof state.leads[number], company: Company) {
    if (lead.score_assessable === false) return "产品超出演示范围，请先确认产品资料";
    const match = lead.scores.icp_fit >= 20 ? `${companyTypeLabel(company.company_type)}符合目标客户类型` : "目标客户匹配度有待确认";
    const product = lead.scores.product_fit >= 15 ? `主营${productsLabel(company.main_products)}，与当前产品相关` : "产品相关性偏弱，建议补充资料";
    return `${match}；${product}。`;
  }
  function contactName(contact: typeof state.contacts[number]) {
    const name = [contact.first_name, contact.last_name].filter(value => value && value !== "UNKNOWN").join(" ");
    return name || "联系人待补充";
  }

  return <div className="workspace-page buyers-workspace">
    <PageHeading eyebrow="客户开发" title="潜在客户分析" description="先看联系理由，再决定下一步。英文公司名与中文资料都可以搜索。">
      <LinkButton href="/settings" icon="settings" secondary>调整目标客户</LinkButton>
    </PageHeading>
    {datasetMode === "public" && <PublicDiscovery key={`${state.project.id}:${state.project_revision}:${state.selection_revision}`} />}
    <div className="summary-strip">
      <div className="summary-item"><span>{datasetMode === "public" ? "已加入的真实客户" : "演示客户"}</span><strong>{rows.length}</strong></div>
      <div className="summary-item"><span>A · 优先联系</span><strong>{rows.filter(({ lead }) => lead.score_assessable !== false && lead.priority === "A").length}</strong></div>
      <div className="summary-item"><span>B · 补充资料</span><strong>{rows.filter(({ lead }) => lead.score_assessable !== false && lead.priority === "B").length}</strong></div>
      <div className="summary-item summary-market"><span>目标市场</span><strong>{countryLabel(state.project.target_country)}</strong></div>
    </div>
    <section className="panel">
      <div className="panel-header"><div><h2>客户工作台 <span className="muted">/ {filtered.length}</span></h2><p>优先级用于安排研究顺序，不代表已核实采购意愿。每行“编辑资料”可补充客户信息，详情页可重新核验官网。</p></div></div>
      <div className="toolbar">
        <div className="search-input"><Icon name="search" size={18} /><input aria-label="搜索潜在客户" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索公司、联系人、产品、城市" /></div>
        <select className="filter-select" aria-label="筛选优先级" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="all">所有优先级</option>{["A", "B", "C", "Disqualified"].map(value => <option key={value} value={value}>{priorityLabel(value)}</option>)}</select>
        <select className="filter-select" aria-label="筛选销售阶段" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">所有阶段</option>{PIPELINE_STAGES.map((stage) => <option key={stage} value={stage}>{STAGE_ZH[stage]}</option>)}</select>
        <select className="filter-select" aria-label="筛选客户类型" value={companyType} onChange={(event) => setCompanyType(event.target.value)}><option value="all">所有客户类型</option>{Array.from(new Set(state.companies.map((company) => company.company_type))).map((type) => <option key={type} value={type}>{companyTypeLabel(type)}</option>)}</select>
        <select className="filter-select" aria-label="按客户评分排序" value={sort} onChange={(event) => setSort(event.target.value)}><option value="desc">评分从高到低</option><option value="asc">评分从低到高</option></select>
        {activeFilters && <button className="button secondary" onClick={clearFilters}>清空筛选</button>}
      </div>
      {filtered.length ? <>
        <div className="table-wrap decision-desktop"><table className="buyer-table decision-table">
          <thead><tr><th>客户</th><th><button onClick={() => setSort(sort === "desc" ? "asc" : "desc")} aria-label="切换评分排序">优先级与评分 {sort === "desc" ? "↓" : "↑"}</button></th><th>推荐理由</th><th>联系人</th><th>当前进展</th><th>下一步</th></tr></thead>
          <tbody>{filtered.map(({ lead, company, contact, action }, index) => <tr key={lead.id}>
            <td><Link href={`/buyers/${lead.id}`} className="company-cell"><CompanyAvatar name={company.company_name} index={index} /><span><strong>{company.company_name}</strong><small>{countryLabel(company.country)} · {companyTypeLabel(company.company_type)}</small></span></Link></td>
            <td className="score-cell">{lead.score_assessable === false ? <span>暂不可评估</span> : <><strong>{lead.total_score}<small>/100</small></strong><PriorityBadge priority={lead.priority} /></>}</td>
            <td><p title={recommendation(lead, company)}>{recommendation(lead, company)}</p></td>
            <td>{contactName(contact)}<small>{jobTitleLabel(contact.title)}</small></td>
            <td><StageBadge stage={lead.status} /></td>
            <td><div className="customer-row-actions"><Link href={action.href} className="button secondary" title={action.reason}>{action.label}</Link><button className="customer-edit-link" aria-label={`编辑${company.company_name}资料`} onClick={() => setEditing(lead.id)}>编辑资料</button></div></td>
          </tr>)}</tbody>
        </table></div>
        <div className="buyer-cards">{filtered.map(({ lead, company, contact, action }, index) => <article className="buyer-card" key={lead.id}>
          <Link href={`/buyers/${lead.id}`} className="company-cell"><CompanyAvatar name={company.company_name} index={index} /><span><strong>{company.company_name}</strong><small>{countryLabel(company.country)} · {companyTypeLabel(company.company_type)}</small></span></Link>
          <div>{lead.score_assessable === false ? <span>暂不可评估</span> : <><PriorityBadge priority={lead.priority} /><strong> {lead.total_score}/100</strong></>} <StageBadge stage={lead.status} /></div>
          <p>{recommendation(lead, company)}</p>
          <p className="muted">{contactName(contact)} · {jobTitleLabel(contact.title)}</p>
          <div className="customer-row-actions"><Link href={action.href} className="button secondary" title={action.reason}>{action.label}<Icon name="arrow" size={16}/></Link><button className="customer-edit-link" aria-label={`编辑${company.company_name}资料`} onClick={() => setEditing(lead.id)}>编辑资料</button></div>
        </article>)}</div>
      </> : <EmptyState title="没有符合条件的客户" description={datasetMode === "public" && !rows.length ? "先查找公开网站候选，核对官网后加入这款产品或组合的开发记录。" : "试试其他关键词，或清空筛选查看当前来源的客户。"} />}
      <div className="list-footer"><span>显示 {filtered.length} / {rows.length} 家客户</span><span>点击客户查看完整资料与分析依据</span></div>
    </section>
    {editing && state.leads.some(lead => lead.id === editing) && <CustomerEditor key={editing} id={editing} onClose={() => setEditing(null)} />}
  </div>;
}

export function BuyerList() { return <Suspense fallback={<p>正在准备潜在客户…</p>}><BuyerWorkspace /></Suspense>; }
