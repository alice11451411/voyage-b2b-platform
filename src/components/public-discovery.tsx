"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useDemo } from "./demo-provider";
import { addPublicBuyer } from "@/lib/workflow";
import { COMPANY_TYPE_ZH, type CompanyType, type Project } from "@/lib/types";
import { countryLabel, fullDate } from "@/lib/display";
import type { SearchResult, WebsiteReview } from "@/lib/discovery-types";

function productKeywords(project: Project): string {
  if (project.selected_products) return project.selected_products.map(productKeywords).filter(Boolean).join(" OR ");
  const confirmed = project.english_facts?.[project.product_name];
  if (confirmed) return confirmed;
  if (/麻辣.*火锅|mala.*hotpot/i.test(project.product_name)) return "mala hotpot soup base";
  if (/火锅|hotpot|hot pot/i.test(project.product_name)) return "hotpot soup base";
  if (/辣酱|chili/i.test(project.product_name)) return "chili sauce";
  if (/调味|seasoning/i.test(project.product_name)) return "seasoning";
  return /[\u3400-\u9fff]/.test(project.product_name) ? "" : project.product_name;
}
async function request<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "请求未完成，请重试。");
  return result as T;
}
const editable = (value: string) => value === "UNKNOWN" ? "" : value;
export function PublicDiscovery() {
  const { state, update, notify } = useDemo();
  const [keywords, setKeywords] = useState(() => productKeywords(state.project));
  const [country, setCountry] = useState(state.project.target_country);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [review, setReview] = useState<WebsiteReview | null>(null);
  const [fields, setFields] = useState({ company_name: "", country: "UNKNOWN", company_type: "UNKNOWN" as CompanyType, main_products: "", distribution_channel: "", email: "" });
  const [confirmed, setConfirmed] = useState(false);
  const ready = state.business_profile.confirmed && state.project.product_confirmed;
  async function find(event: FormEvent) {
    event.preventDefault(); if (busy || !ready) return;
    setBusy("search"); setError(""); setSearch(null);
    try { setSearch(await request<SearchResult>("/api/discovery/search", { project: state.project, keywords: keywords.trim(), country, buyer_types: state.project.target_buyer_type })); }
    catch (error) { setError(error instanceof Error ? error.message : "搜索未完成。"); }
    finally { setBusy(""); }
  }
  async function verify(website = url) {
    if (busy) return;
    setBusy("verify"); setError(""); setReview(null); setConfirmed(false);
    try {
      const result = await request<WebsiteReview>("/api/discovery/verify", { url: website.trim() });
      setReview(result); setUrl(result.website);
      setFields({ company_name: editable(result.company_name), country: result.country || "UNKNOWN", company_type: (Object.hasOwn(COMPANY_TYPE_ZH, result.company_type) ? result.company_type : "UNKNOWN") as CompanyType, main_products: editable(result.main_products), distribution_channel: editable(result.distribution_channel), email: result.public_emails[0]?.email ?? "" });
    } catch (error) { setError(error instanceof Error ? error.message : "官网读取未完成。"); }
    finally { setBusy(""); }
  }
  function add(event: FormEvent) {
    event.preventDefault(); if (!review || !confirmed || !ready) return;
    if (!fields.company_name.trim()) { notify("请核对并填写实际公司名称。"); return; }
    const version = { id: state.project.id, revision: state.project_revision, selection: state.selection_revision };
    if (update(current => {
      if (current.project.id !== version.id || current.project_revision !== version.revision || current.selection_revision !== version.selection) throw new Error("开发选择已变化，请重新核验后加入。");
      return addPublicBuyer(current, review, { ...fields, main_products: fields.main_products.trim() || "UNKNOWN", distribution_channel: fields.distribution_channel.trim() || "UNKNOWN" });
    }, "已加入当前开发选择的真实客户。相同官网会去重，邮箱未验证投递。")) { setReview(null); setConfirmed(false); }
  }
  return <section className="panel discovery-panel" aria-label="公开网站获客"><div className="panel-header"><div><span className="discovery-eyebrow">从这里获取真实客户</span><h2>按产品寻找海外公司</h2><p>先找到候选网页，再核对官网与公开联系入口，最后加入客户工作台。</p></div><span className="badge source-public">公开来源</span></div><div className="panel-body">
    {!ready && <div className="notice">先保存你公司的资料和产品，再按实际产品寻找客户。<Link className="text-link" href="/settings#products">填写企业产品和资料 →</Link></div>}
    <form className="discovery-search-form" onSubmit={find}><label className="field">英文产品关键词<input required aria-label="获客产品关键词" value={keywords} onChange={event => setKeywords(event.target.value)} placeholder="例如 hotpot soup base 或 chili sauce" /></label><label className="field">寻找客户的市场<select aria-label="获客目标市场" value={country} onChange={event => setCountry(event.target.value)}><option value="United States">美国</option><option value="Canada">加拿大</option><option value="Germany">德国</option>{!["United States", "Canada", "Germany"].includes(country) && <option value={country}>{countryLabel(country)}</option>}</select></label><button className="button primary" type="submit" disabled={!!busy || !ready}>{busy === "search" ? "正在寻找公开网页…" : "搜索海外公司"}</button></form>
    <p className="field-help">相近产品可能找到相同公司。是否适配以官网品类和人工核验为准，搜索结果不代表采购意愿。此处检索市场不改变产品配置，也不自动确认公司所在国。</p>
    <details className="detail-disclosure" open><summary>已有公司官网？直接核验</summary><form className="website-lookup" onSubmit={event => { event.preventDefault(); void verify(); }}><label className="field">公司官网<input required type="url" aria-label="待核验公司官网" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://公司官网" /></label><button type="submit" className="button secondary" disabled={!!busy}>{busy === "verify" ? "正在读取公开资料…" : "读取并核验官网"}</button></form></details>
    {error && <div className="discovery-error" role="alert">{error}<p>搜索或读取失败不会使用演示企业替补。可以稍后重试，或输入另一家已知官网。</p></div>}
    {search && <div className="search-candidates"><p className="field-help">实际检索：{search.query} · {fullDate(search.searched_at)}。以下是网页候选，请核对是否属于公司官网。</p>{search.results.length ? search.results.map(candidate => <article className="search-candidate" key={candidate.url}><div><h3>{candidate.title}</h3><a href={candidate.url} target="_blank" rel="noopener noreferrer">打开网页来源 ↗</a><p className="source-excerpt">{candidate.snippet}</p></div><button className="button secondary" disabled={!!busy} onClick={() => { setUrl(candidate.url); void verify(candidate.url); }}>核对这家网站</button></article>) : <p className="notice">这次没有找到可用的公开网页候选，请调整关键词或市场。</p>}</div>}
    {review && <section className="website-review"><h3>核对这家公司，再加入开发记录</h3><p>已读取公开网页，网站主体与资料仍需你核对。没有猜测邮箱、采购负责人或采购意向。</p><a href={review.website} target="_blank" rel="noopener noreferrer" className="text-link">打开该网站 ↗</a><details className="detail-disclosure" open><summary>网页证据与公开联系方式</summary>{review.evidence.map(evidence => <div className="source-evidence" key={evidence.url}><a href={evidence.url} target="_blank" rel="noopener noreferrer">{evidence.title || evidence.url} ↗</a><small>网页原文 · {fullDate(evidence.retrieved_at)}</small><blockquote>{evidence.snippet}</blockquote></div>)}<p>公开邮箱：{review.public_emails.length ? review.public_emails.map(item => item.email).join("、") : "未找到，保留为空"}。公开展示不等于可投递，也不等于采购负责人。</p>{review.contact_url && review.contact_url !== "UNKNOWN" && <a className="text-link" href={review.contact_url} target="_blank" rel="noopener noreferrer">打开公开联系页面 ↗</a>}</details>
      <form onSubmit={add}><div className="product-form-grid"><label className="field">实际公司名称<input required aria-label="真实客户公司名称" value={fields.company_name} onChange={event => { setFields({ ...fields, company_name: event.target.value }); setConfirmed(false); }}/></label><label className="field">公司所在国<select aria-label="真实客户所在国" value={fields.country} onChange={event => { setFields({ ...fields, country: event.target.value }); setConfirmed(false); }}><option value="UNKNOWN">待核实</option><option value="United States">美国</option><option value="Canada">加拿大</option><option value="Germany">德国</option>{!["UNKNOWN", "United States", "Canada", "Germany"].includes(fields.country) && <option value={fields.country}>{countryLabel(fields.country)}</option>}</select></label><label className="field">客户类型<select aria-label="真实客户类型" value={fields.company_type} onChange={event => { setFields({ ...fields, company_type: event.target.value as CompanyType }); setConfirmed(false); }}>{Object.entries(COMPANY_TYPE_ZH).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="field">使用的公开邮箱<select aria-label="真实客户公开邮箱" value={fields.email} onChange={event => { setFields({ ...fields, email: event.target.value }); setConfirmed(false); }}><option value="">暂不填写邮箱</option>{review.public_emails.map(item => <option key={item.email} value={item.email}>{item.email}（未验证投递）</option>)}</select></label><label className="field">主营产品（核对网页原文）<textarea aria-label="真实客户主营产品" rows={3} value={fields.main_products} onChange={event => { setFields({ ...fields, main_products: event.target.value }); setConfirmed(false); }}/></label><label className="field">经营渠道（未知可留空）<textarea aria-label="真实客户经营渠道" rows={3} value={fields.distribution_channel} onChange={event => { setFields({ ...fields, distribution_channel: event.target.value }); setConfirmed(false); }}/></label></div><label className="checkbox-label"><input aria-label="确认真实客户资料" type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>我已核对网站属于这家公司，所填资料来自公开网页；未知信息保留为空。</label><div className="product-form-actions"><button type="submit" className="button primary" disabled={!ready || !confirmed || !!busy}>加入当前开发客户</button></div></form>
    </section>}
  </div></section>;
}
