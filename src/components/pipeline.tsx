"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useCustomerWorkspace } from "./demo-provider";
import { Icon } from "./icons";
import { CompanyAvatar, LinkButton, PageHeading, PriorityBadge } from "./ui";
import { PIPELINE_STAGES, STAGE_ZH, type Lead, type PipelineStage } from "@/lib/types";
import { getNextAction, isOverdue, transitionLead } from "@/lib/workflow";
import { cityLabel, fullDate, relativeDate } from "@/lib/display";

const subscribe = (fn: () => void) => { window.addEventListener("popstate", fn); return () => window.removeEventListener("popstate", fn); };
const getSearch = () => window.location.search;
const serverSearch = () => "";
const groups: Record<string, { label: string; stages: PipelineStage[] }> = {
  prepare: { label: "准备联系", stages: ["Identified", "Researched", "Qualified", "Ready to Contact"] },
  contact: { label: "联系跟进", stages: ["Contacted", "Replied", "Meeting", "Sample"] },
  sales: { label: "成交推进", stages: ["Quoted", "Negotiation", "Won"] },
  overdue: { label: "逾期待跟进", stages: [] },
  lost: { label: "流失归档", stages: ["Lost"] },
  all: { label: "全部阶段", stages: [...PIPELINE_STAGES] },
};
export function Pipeline() {
  const { state, update } = useCustomerWorkspace();
  const search = useSyncExternalStore(subscribe, getSearch, serverSearch);
  const value = new URLSearchParams(search).get("view") ?? "prepare";
  const view = Object.hasOwn(groups, value) ? value : "prepare";
  const [dragging, setDragging] = useState<string | null>(null);
  const [hover, setHover] = useState<PipelineStage | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const board = boardRef.current, top = topScrollRef.current, content = scrollContentRef.current;
    if (!board || !top || !content) return;
    board.scrollLeft = 0;
    const measure = () => {
      content.style.width = `${board.scrollWidth}px`;
      top.hidden = board.scrollWidth <= board.clientWidth + 1;
      top.scrollLeft = board.scrollLeft;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(board);
    for (const column of board.children) observer.observe(column);
    return () => observer.disconnect();
  }, [view]);
  const due = state.leads.filter(l => isOverdue(l)).sort((a, b) => Date.parse(a.next_followup_date!) - Date.parse(b.next_followup_date!));
  function select(next: string) { window.history.pushState(null, "", `/pipeline?view=${next}`); window.dispatchEvent(new PopStateEvent("popstate")); }
  function card(lead: Lead, index: number) {
    const company = state.companies.find(c => c.id === lead.company_id)!;
    const contact = state.contacts.find(c => c.id === lead.contact_id)!;
    const action = getNextAction(state, lead);
    return <article key={lead.id} className={`kanban-card ${dragging === lead.id ? "dragging" : ""}`} draggable onDragStart={e => { e.dataTransfer.setData("text/plain", lead.id); setDragging(lead.id); }} onDragEnd={() => { setDragging(null); setHover(null); }}>
      <div className="kanban-card-top"><CompanyAvatar name={company.company_name} index={index} /><span className="drag-grip" aria-hidden="true">⠿</span></div><Link href={`/buyers/${lead.id}`} className="kanban-company">{company.company_name}</Link><p>{cityLabel(company.city)}</p><div className="kanban-card-scores"><PriorityBadge priority={lead.priority} /><span>{lead.score_assessable === false ? "暂不可评估" : <><strong>{lead.total_score}</strong> / 100</>}</span></div><div className="kanban-contact"><Icon name="buyers" size={14} />{contact.first_name === "UNKNOWN" ? "联系人待补充" : `${contact.first_name} ${contact.last_name}`}</div>
      {lead.next_followup_date && <Link href={`/buyers/${lead.id}#followup`} title={fullDate(lead.next_followup_date)} className={`kanban-followup ${isOverdue(lead) ? "overdue" : ""}`}><Icon name="clock" size={14} />{relativeDate(lead.next_followup_date)} · 跟进</Link>}
      <Link href={action.href} className="text-link task-next">{action.label}<Icon name="arrow" size={15}/></Link>
      <label className="kanban-stage-label">记录进展<select aria-label={`${company.company_name} 阶段`} value={lead.status} onChange={e => update(current => transitionLead(current, lead.id, e.target.value as PipelineStage), "销售进展已更新。")}>{PIPELINE_STAGES.map(stage => <option key={stage} value={stage}>{STAGE_ZH[stage]}</option>)}</select></label>
    </article>;
  }
  return <div className="workspace-page pipeline-workspace">
    <PageHeading eyebrow="客户关系管理" title="CRM 关系管理进展" description="按销售任务查看阶段；拖拽和菜单只记录明确发生的进展。"><LinkButton href="/buyers" secondary icon="buyers">查看潜在客户</LinkButton></PageHeading>
    <div className="pipeline-summary"><span><strong>{state.leads.filter(l => !["Won", "Lost"].includes(l.status)).length}</strong> 家正在开发</span><span><strong>{due.length}</strong> 项逾期待跟进</span><span>先审核，再模拟发送；后续事件按实际记录。</span></div>
    <div className="tabs pipeline-tabs" aria-label="销售进展视图">{Object.entries(groups).map(([key, group]) => <button key={key} className={`tab-button ${view === key ? "active" : ""}`} onClick={() => select(key)}>{group.label}{key === "overdue" && <span>{due.length}</span>}</button>)}</div>
    {view === "overdue" ? <section className="panel"><div className="panel-header"><h2>优先处理逾期跟进</h2><span>{due.length} 家</span></div>{due.length ? <div className="due-card-grid">{due.map(card)}</div> : <div className="empty-state"><Icon name="check" size={30}/><h3>当前没有逾期跟进</h3><p>可以切换到联系跟进，查看已安排的下一步。</p></div>}</section>
    : <><div className="kanban-top-scroll" ref={topScrollRef} role="region" aria-label="看板顶部横向滚动" tabIndex={0} onKeyDown={event => { if (event.key === "Home" || event.key === "End") { event.preventDefault(); event.currentTarget.scrollLeft = event.key === "Home" ? 0 : event.currentTarget.scrollWidth - event.currentTarget.clientWidth; } }} onScroll={event => { const board = boardRef.current; if (board && Math.abs(board.scrollLeft - event.currentTarget.scrollLeft) > 1) board.scrollLeft = event.currentTarget.scrollLeft; }}><div ref={scrollContentRef} aria-hidden="true" /></div><div ref={boardRef} className="kanban-board" role="region" aria-label="销售阶段看板" tabIndex={0} onScroll={event => { const top = topScrollRef.current; if (top && Math.abs(top.scrollLeft - event.currentTarget.scrollLeft) > 1) top.scrollLeft = event.currentTarget.scrollLeft; }}>{groups[view].stages.map((stage, index) => { const leads = state.leads.filter(l => l.status === stage); return <section key={stage} className={`kanban-column ${hover === stage ? "drag-over" : ""}`} onDragOver={e => { e.preventDefault(); setHover(stage); }} onDragLeave={() => setHover(null)} onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain") || dragging; if (id) update(current => transitionLead(current, id, stage), `已记录：${STAGE_ZH[stage]}。`); setDragging(null); setHover(null); }}><header className="kanban-heading"><div><span className={`column-dot column-dot-${index % 5}`} /><h2>{STAGE_ZH[stage]}</h2><span className="column-count">{leads.length}</span></div></header><div className="kanban-cards">{leads.length ? leads.map(card) : <div className="kanban-empty"><Icon name="plus" size={17}/><span>暂无客户；可拖到这里记录进展</span></div>}</div></section>; })}</div></>}
    <div className="board-footnote"><Icon name="info" size={16}/><span>保留全部 12 个销售阶段。阶段回退或流失归档不删除已记录事实；模拟发送会安排 3 天后跟进，不实际外发。</span></div>
  </div>;
}
