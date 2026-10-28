"use client";
import Link from "next/link";
import { STAGE_ZH, type PipelineStage, type Priority } from "@/lib/types";
import { Icon, type IconName } from "./icons";
import { priorityLabel } from "@/lib/display";
export function PageHeading({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div><div className="heading-actions">{children}</div></div>;
}
export function PriorityBadge({ priority }: { priority: Priority }) { return <span className={`badge priority-${priority.toLowerCase()}`}>{priorityLabel(priority)}</span>; }
export function StageBadge({ stage }: { stage: PipelineStage }) { return <span className={`stage-badge stage-${stage.toLowerCase().replaceAll(" ", "-")}`}><i />{STAGE_ZH[stage]}</span>; }
export function CompanyAvatar({ name, index = 0 }: { name: string; index?: number }) { return <span className={`company-avatar avatar-${index % 4}`}>{name.split(" ").map(word => word[0]).slice(0, 2).join("")}</span>; }
export function LinkButton({ href, children, icon, secondary = false }: { href: string; children: React.ReactNode; icon?: IconName; secondary?: boolean }) { return <Link className={`button ${secondary ? "secondary" : "primary"}`} href={href}>{icon && <Icon name={icon} size={17} />}{children}</Link>; }
export function EmptyState({ title, description }: { title: string; description: string }) { return <div className="empty-state"><Icon name="search" size={32} /><h3>{title}</h3><p>{description}</p></div>; }
export const percent = (value: number) => `${Math.round(value * 10) / 10}%`;
export function displayDate(date: string) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit" }).format(new Date(date)); }
