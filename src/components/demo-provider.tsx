"use client";
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createDemoState, type DemoState } from "@/data/demo";
import { loadState, STORAGE_KEY } from "@/lib/persistence";
import { resetDemo, synchronizeProduct } from "@/lib/workflow";
let snapshot: DemoState | undefined;
let storageError = "";
let canPersist = true;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const emit = () => listeners.forEach(listener => listener());
function initialize() {
  if (snapshot) return;
  try {
    const loaded = loadState(localStorage);
    snapshot = loaded.state; storageError = loaded.warning; canPersist = loaded.canPersist;
  } catch { snapshot = createDemoState(); storageError = "浏览器存储不可用，当前操作刷新后可能丢失。"; }
  emit();
}
function persist(next: DemoState) {
  next = synchronizeProduct(next);
  snapshot = next;
  try { if (canPersist) { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); storageError = ""; } }
  catch { storageError = "浏览器未能保存变更，刷新可能丢失当前操作。"; }
  emit();
}
type DatasetMode = "public" | "demo";
type DemoContextType = { state: DemoState; datasetMode: DatasetMode; setDatasetMode: (mode: DatasetMode) => void; update: (fn: (current: DemoState) => DemoState, message?: string) => boolean; notify: (message: string) => void; reset: () => void };
const DemoContext = createContext<DemoContextType | null>(null);
export function DemoProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => undefined);
  const [toast, setToast] = useState("");
  const [datasetMode, changeDatasetMode] = useState<DatasetMode>(() => {
    try { return typeof window !== "undefined" && localStorage.getItem("voyage-customer-source-mode") === "demo" ? "demo" : "public"; } catch { return "public"; }
  });
  useEffect(initialize, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 5000); return () => clearTimeout(timer); }, [toast]);
  const notify = (message: string) => setToast(message);
  function setDatasetMode(mode: DatasetMode) {
    changeDatasetMode(mode);
    try { localStorage.setItem("voyage-customer-source-mode", mode); } catch { notify("数据来源已切换，浏览器暂未保存此偏好。"); }
  }
  function update(fn: (current: DemoState) => DemoState, message?: string) {
    try { if (!snapshot) return false; persist(fn(snapshot)); if (message) notify(message); return true; }
    catch (error) { notify(error instanceof Error ? error.message : "操作未完成，请重试。"); return false; }
  }
  if (!state) return <div className="loading-screen"><span className="loading-logo">远航</span><p>正在准备海外客户工作台…</p></div>;
  return <DemoContext.Provider value={{ state, datasetMode, setDatasetMode, update, notify, reset: () => { canPersist = true; persist(resetDemo(state)); notify("演示数据已恢复，可以重新演示。"); } }}>
    {storageError && <div className="storage-warning" role="alert">{storageError}</div>}{children}
    {toast && <div className="toast" role="status"><span>{toast}</span><button aria-label="关闭提示" onClick={() => setToast("")}>×</button></div>}
  </DemoContext.Provider>;
}
export function useDemo() { const context = useContext(DemoContext); if (!context) throw new Error("DemoProvider is required"); return context; }
/** 展示与统计分开；业务更新始终操作完整存储，避免切换来源丢记录。 */
export function useCustomerWorkspace() {
  const context = useDemo();
  const leads = context.state.leads.filter(lead => {
    const company = context.state.companies.find(company => company.id === lead.company_id);
    return context.datasetMode === "public" ? company?.dataset === "public" : company?.dataset !== "public";
  });
  const ids = new Set(leads.map(lead => lead.id));
  return { ...context, state: { ...context.state, leads, drafts: context.state.drafts.filter(draft => ids.has(draft.lead_id)), followup_drafts: context.state.followup_drafts.filter(draft => ids.has(draft.lead_id)), activities: context.state.activities.filter(activity => ids.has(activity.lead_id)) } };
}
