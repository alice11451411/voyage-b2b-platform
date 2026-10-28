"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DemoProvider, useDemo } from "./demo-provider";
import { Icon, type IconName } from "./icons";
import { isOverdue } from "@/lib/workflow";
import { ProductSelection } from "./product-selection";
import { CustomerSource } from "./customer-source";
const navigation: { href: string; label: string; shortLabel: string; icon: IconName }[] = [
  { href: "/settings", label: "企业产品和资料", shortLabel: "企业与产品", icon: "building" },
  { href: "/buyers", label: "潜在客户分析", shortLabel: "客户分析", icon: "buyers" },
  { href: "/pipeline", label: "CRM 关系管理进展", shortLabel: "CRM 进展", icon: "pipeline" },
  { href: "/", label: "整体仪表盘", shortLabel: "仪表盘", icon: "dashboard" },
];
function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); const { state, datasetMode } = useDemo();
  const current = navigation.find(item => item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));
  const visibleLeads = state.leads.filter(lead => { const company = state.companies.find(company => company.id === lead.company_id); return datasetMode === "public" ? company?.dataset === "public" : company?.dataset !== "public"; });
  const tasks = visibleLeads.filter(lead => isOverdue(lead)).length;
  return <div className="app-layout"><aside className="sidebar">
    <Link href="/" className="brand" aria-label="远航 · 返回整体仪表盘"><span className="brand-mark"><svg width="32" height="34" viewBox="0 0 28 30" fill="none" aria-hidden="true"><path d="m3 22 11-19 11 19H3Z" stroke="currentColor" strokeWidth="1.5"/><path d="m14 11-4 7h8l-4-7Z" fill="currentColor"/><path d="M9 27h10" stroke="currentColor" strokeWidth="1.5"/></svg></span><span>远航<span className="brand-en">VOYAGE</span></span></Link>
    <Link href="/settings#business" className="workspace-card" aria-label="填写我的企业与产品"><span className="workspace-icon"><Icon name="building" size={18} /></span><div><strong>{state.business_profile.confirmed ? state.business_profile.company_name : "填写我的企业资料"}</strong><span>企业资料与产品目录</span></div><Icon name="chevron" size={14} /></Link>
    <div className="nav-label">客户开发工作台</div><nav aria-label="主导航">{navigation.map(item => <Link key={item.href} href={item.href} aria-label={item.label} className={`nav-item ${current?.href === item.href ? "active" : ""}`} aria-current={current?.href === item.href ? "page" : undefined}><Icon name={item.icon} size={19} /><span className="nav-desktop-label">{item.label}</span><span className="nav-mobile-label">{item.shortLabel}</span>{item.href === "/buyers" && <small>{visibleLeads.length}</small>}</Link>)}</nav>
    <div className="sidebar-guide"><div className="guide-icon"><Icon name="globe" /></div><strong>让每一次联系都有依据</strong><p>研究客户 · 人工审核<br />持续跟进 · 看清转化</p><Link href="/buyers">开始客户开发 <Icon name="arrow" size={15} /></Link></div>
    <div className="sidebar-bottom"><span className="status-dot" /> 本地工作台<span className="version">v2.0</span></div>
  </aside><div className="main-wrap"><header className="topbar"><div className="breadcrumbs"><span className="breadcrumb-root">客户工作台</span><span>/</span><strong>{pathname.startsWith("/buyers/") ? "客户详情" : current?.label || "工作台"}</strong></div><div className="topbar-right"><span className={`dataset-pill ${datasetMode === "public" ? "dataset-public" : "dataset-demo"}`}>{datasetMode === "public" ? "公开来源 · 不会真实发信" : "演示数据 · 不会真实发信"}</span><Link href="/pipeline?view=overdue" className="topbar-task" aria-label={`查看逾期跟进，${tasks} 项待办`}><Icon name="clock" size={17} /><span>跟进待办</span>{tasks > 0 && <b>{tasks}</b>}</Link><Link href="/settings#business" className="user-avatar" aria-label="查看企业资料" title={state.business_profile.company_name}>{state.business_profile.company_name.slice(0, 1) || "企"}</Link></div></header>
  <main id="main-content" className="main-content">{pathname !== "/settings" && <div className="workspace-context">{(state.business_profile.confirmed || state.products.length > 1) && <ProductSelection key={`${state.project.id}:${state.selection_revision}`} />}<CustomerSource /></div>}{children}</main><footer className="app-footer"><span>{datasetMode === "public" ? "公开来源不代表采购意愿或已有商业关系；公开邮箱未验证投递" : "演示客户与联系人为虚构，采购信号未经真实核验"}</span><span>研究 → 审核 → 模拟发送 → 跟进</span></footer></div></div>;
}
export function AppShell({ children }: { children: React.ReactNode }) { return <DemoProvider><Shell>{children}</Shell></DemoProvider>; }
