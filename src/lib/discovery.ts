import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import type { SearchCandidate, SearchInput, SearchResult, WebsiteReview } from "./discovery-types.ts";

const MAX_PAGE = 512 * 1024;
const TIMEOUT = 10_000;

export class DiscoveryError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export function buildSearchQuery(input: SearchInput): string {
  if (typeof input?.keywords !== "string" || !input.keywords.trim()) throw new DiscoveryError(400, "请填写这款产品的英文搜索关键词。");
  for (const field of [input.keywords, input.country, input.buyer_types]) {
    if (typeof field !== "string" || field.length > 300 || /[\r\n\x00-\x1f]/.test(field)) throw new DiscoveryError(400, "搜索条件格式不正确，单项最多 300 个字符。");
  }
  if (!input.country.trim()) throw new DiscoveryError(400, "请选择目标国家。");
  return [input.keywords, input.country, input.buyer_types, "official website contact"].map((part) => part.trim()).filter(Boolean).join(" ");
}

function decodeText(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:x[0-9a-f]+|\d+);/gi, (entity) => {
    const named: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " " };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    const number = entity.slice(2, -1); const code = number[0].toLowerCase() === "x" ? parseInt(number.slice(1), 16) : parseInt(number, 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}

function readable(html: string, stripNavigation = true): string {
  let content = html.replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  if (stripNavigation) content = content.replace(/<(nav|header|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  return decodeText(content.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function safeUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new DiscoveryError(400, "请输入完整的官网网址（https://…）。"); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port && !["80", "443"].includes(url.port)) throw new DiscoveryError(400, "仅支持不含账号密码、使用标准端口的公开 HTTP/HTTPS 官网。");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (isIP(hostname.replace(/^\[|\]$/g, "")) || !hostname.includes(".") || /(?:^|\.)(?:localhost|local|internal|lan|home|test\.localhost)$/.test(hostname)) throw new DiscoveryError(400, "请使用公开官网域名，不能访问本机、内网或 IP 地址。");
  url.hash = "";
  return url;
}

function parseMcp(raw: string): unknown {
  try { return JSON.parse(raw); } catch {
    for (const line of raw.split(/\r?\n/).reverse()) {
      if (line.startsWith("data:")) { try { return JSON.parse(line.slice(5).trim()); } catch { /* ignore non-JSON event */ } }
    }
    throw new DiscoveryError(502, "搜索服务返回了无法读取的结果，请稍后重试。");
  }
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
function limited(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, item]) => (/rate.?limited/i.test(key) && item === true) || limited(item));
}

function normalizeCandidates(candidates: SearchCandidate[]): SearchCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    try { candidate.url = safeUrl(candidate.url).href; } catch { return false; }
    const key = candidate.url.replace(/\/$/, "");
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 6).map((candidate) => ({ ...candidate, title: candidate.title.slice(0, 200), snippet: candidate.snippet.slice(0, 800) }));
}

export async function searchPublicCompanies(input: SearchInput, fetcher: typeof fetch = fetch): Promise<SearchResult> {
  const query = buildSearchQuery(input);
  const apiKey = process.env.EXA_API_KEY;
  let response: Response;
  try {
    response = await fetcher(apiKey ? "https://api.exa.ai/search" : "https://mcp.exa.ai/mcp", {
      method: "POST", headers: apiKey ? { "Content-Type": "application/json", "x-api-key": apiKey } : { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify(apiKey ? { query, numResults: 6, contents: { text: { maxCharacters: 1800 } } } : { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "web_search_exa", arguments: { query, numResults: 6, type: "auto" } } }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch { throw new DiscoveryError(502, "当前无法连接海外搜索服务。请稍后重试，或粘贴已知官网进行核验。"); }
  if (response.status === 429) throw new DiscoveryError(429, "公开搜索额度暂时用完，请稍后重试，或粘贴已知官网进行核验。");
  if (!response.ok) throw new DiscoveryError(502, "海外搜索服务暂时不可用，请稍后重试。");
  const raw = await response.text();
  if (raw.length > 2 * 1024 * 1024) throw new DiscoveryError(502, "搜索服务返回内容过大，请缩小关键词范围。");
  const payload = record(parseMcp(raw));
  const result = apiKey ? payload : record(payload.result);
  if (limited(result)) throw new DiscoveryError(429, "公开搜索额度暂时用完，请稍后重试，或粘贴已知官网进行核验。");
  if (payload.error || result.isError) throw new DiscoveryError(502, "海外搜索没有完成，请稍后重试。");
  const structured = record(result.structuredContent);
  const rows = Array.isArray(result.results) ? result.results : Array.isArray(structured.results) ? structured.results : [];
  const candidates: SearchCandidate[] = rows.map((row) => {
    const item = record(row);
    return { url: String(item.url || ""), title: String(item.title || ""), snippet: String(item.text || item.snippet || "") };
  });
  if (!candidates.length && Array.isArray(result.content)) {
    const text = result.content.map((block) => String(record(block).text || "")).join("\n");
    for (const match of text.matchAll(/Title:\s*([^\n]+)\r?\n[\s\S]*?URL:\s*(https?:\/\/[^\s]+)([\s\S]*?)(?=\nTitle:|$)/g)) {
      candidates.push({ title: match[1].trim(), url: match[2], snippet: match[3].replace(/^\s*(?:Text|Content|Summary):\s*/i, "").trim() });
    }
  }
  const results = normalizeCandidates(candidates);
  if (!results.length) throw new DiscoveryError(502, "搜索服务没有返回可用的公开网站。请调整产品关键词或粘贴已知官网进行核验。");
  return { query, provider: apiKey ? "Exa API" : "Exa 公开搜索", results, searched_at: new Date().toISOString() };
}

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 100 && b >= 64 && b <= 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 || b === 2 && c === 0) || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113);
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return /^[23][0-9a-f]{3}:/.test(normalized) && !/^2001:(?:0?db8|0{1,4}):|^2002:/i.test(normalized);
  }
  return false;
}

interface Address { address: string; family: number }
interface Page { status: number; headers: Record<string, string | undefined>; body: string }
export interface WebsiteNetwork {
  resolve: (hostname: string) => Promise<Address[]>;
  read: (url: URL, address: Address) => Promise<Page>;
}

function requestPage(url: URL, address: Address): Promise<Page> {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      method: "GET", family: address.family,
      // Pin the already-checked DNS result; a second lookup must not reach an internal address.
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      headers: { "User-Agent": "OverseasBuyerWorkbench/1.0 (public company research)", Accept: "text/html,text/plain;q=0.9", "Accept-Encoding": "identity" },
    }, (response) => {
      const chunks: Buffer[] = []; let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_PAGE) request.destroy(new DiscoveryError(502, "网页内容超过读取上限，请选择具体的公司介绍或联系页面。"));
        else chunks.push(chunk);
      });
      response.on("end", () => resolve({ status: response.statusCode || 0, headers: Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : value])), body: Buffer.concat(chunks).toString("utf8") }));
      response.on("error", reject);
    });
    const timer = setTimeout(() => request.destroy(new DiscoveryError(502, "官网读取超时，请稍后重试。")), TIMEOUT);
    request.on("close", () => clearTimeout(timer));
    request.on("error", reject);
    request.end();
  });
}

const defaultNetwork: WebsiteNetwork = { resolve: (hostname) => lookup(hostname, { all: true }), read: requestPage };

async function readWebsite(url: URL, network: WebsiteNetwork, origin: string, redirects = 0): Promise<{ url: URL; page: Page }> {
  safeUrl(url.href);
  let addresses: Address[];
  try { addresses = await network.resolve(url.hostname); } catch { throw new DiscoveryError(502, "无法解析官网域名，请检查网址。"); }
  if (!addresses.length || addresses.some((address) => !isPublicAddress(address.address))) throw new DiscoveryError(400, "官网域名必须全部解析到公网地址，不能访问本机或内网。");
  let page: Page;
  try { page = await network.read(url, addresses[0]); } catch (error) { if (error instanceof DiscoveryError) throw error; throw new DiscoveryError(502, "无法读取官网。网站可能暂时离线或拒绝自动访问，请人工打开核验。"); }
  if ([301, 302, 303, 307, 308].includes(page.status)) {
    if (!page.headers.location || redirects >= 3) throw new DiscoveryError(502, "官网重定向过多或未提供跳转地址。");
    const target = safeUrl(new URL(page.headers.location, url).href);
    // Permit canonical HTTPS / www redirects, but never redirects to another domain.
    const sameHost = target.hostname.replace(/^www\./, "") === url.hostname.replace(/^www\./, "");
    const canonical = sameHost && (target.protocol === url.protocol || url.protocol === "http:" && target.protocol === "https:");
    if (target.origin !== origin && !canonical) throw new DiscoveryError(400, "官网发生跨站跳转，请人工确认新的官网地址后重新核验。");
    return readWebsite(target, network, target.origin, redirects + 1);
  }
  if (page.status < 200 || page.status >= 300) throw new DiscoveryError(502, `官网暂时无法读取（HTTP ${page.status}），请人工打开核验。`);
  if (!/text\/(?:html|plain)|application\/xhtml\+xml/i.test(page.headers["content-type"] || "")) throw new DiscoveryError(502, "该地址不是可读取的网页，请填写公司官网或联系页面。");
  if (Buffer.byteLength(page.body) > MAX_PAGE) throw new DiscoveryError(502, "网页内容超过读取上限。");
  if (/verify (?:that )?you are human|checking your browser|just a moment|cf-chl-|captcha|access denied/i.test(readable(page.body).slice(0, 2000)) && readable(page.body).length < 3000) throw new DiscoveryError(502, "官网要求人工验证或限制自动访问，请人工打开核验；未生成公司资料。");
  return { url, page };
}

export async function verifyWebsite(value: string, network: WebsiteNetwork = defaultNetwork): Promise<WebsiteReview> {
  if (typeof value !== "string" || value.length > 2048) throw new DiscoveryError(400, "官网网址格式不正确。");
  const hostname = safeUrl(value.trim()).hostname.toLowerCase().replace(/^www\./, "");
  const directories = ["unisco.com", "linkedin.com", "facebook.com", "alibaba.com", "made-in-china.com", "go4worldbusiness.com", "tradekey.com", "zoominfo.com", "kompass.com", "yelp.com", "yellowpages.com"];
  if (directories.some(domain => hostname === domain || hostname.endsWith(`.${domain}`))) throw new DiscoveryError(400, "这是平台或第三方目录页面。请打开来源找到该公司的独立官网，再填写官网地址核验；目录中的不同企业不能共用平台域名作为官网。");
  const first = await readWebsite(safeUrl(value.trim()), network, safeUrl(value.trim()).origin);
  const pages = [first];
  const links: URL[] = [];
  for (const match of first.page.body.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const target = safeUrl(new URL(decodeText(match[1]), first.url).href);
      if (target.origin === first.url.origin && target.href !== first.url.href && /contact|about|company|联系|关于/i.test(target.pathname + " " + readable(match[2])) && !links.some((link) => link.href === target.href)) links.push(target);
    } catch { /* Ignore non-website and external links. */ }
  }
  links.sort((a, b) => Number(/contact|联系/i.test(b.pathname)) - Number(/contact|联系/i.test(a.pathname)));
  for (const link of links.slice(0, 2)) {
    try {
      const retrieved = await readWebsite(link, network, first.url.origin);
      if (!pages.some(({ url }) => url.href === retrieved.url.href)) pages.push(retrieved);
    } catch { /* Keep only successfully retrieved page evidence. */ }
  }
  const now = new Date().toISOString();
  const publicEmails: WebsiteReview["public_emails"] = [];
  const evidence = pages.map(({ url, page }) => {
    const title = readable(page.body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").slice(0, 200);
    const text = readable(page.body);
    const mailto = Array.from(page.body.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "").matchAll(/href\s*=\s*["']mailto:([^"'?]+)(?:\?[^"']*)?["']/gi)).map((match) => decodeText(match[1])).join(" ");
    for (const match of (readable(page.body, false) + " " + mailto).matchAll(/\b[A-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}\b/gi)) {
      const email = match[0].toLowerCase();
      if (!/\.(?:png|jpe?g|gif|svg|webp|css|js)$/i.test(email) && !publicEmails.some((item) => item.email === email)) publicEmails.push({ email, source_url: url.href });
    }
    return { url: url.href, title, snippet: text.slice(0, 1000), retrieved_at: now };
  });
  if (!evidence[0].snippet) throw new DiscoveryError(502, "官网没有可读取的公开文字，请人工核验。");
  const companyName = evidence[0].title.split(/\s*[|–—]\s*|\s+-\s+/)[0].trim();
  return {
    website: first.url.href, company_name: companyName && !/^(?:home(?:\s*page)?|welcome|contact(?:\s*us)?|首页)$/i.test(companyName) ? companyName : "UNKNOWN",
    country: "UNKNOWN", company_type: "UNKNOWN", main_products: "UNKNOWN", distribution_channel: "UNKNOWN",
    public_emails: publicEmails.slice(0, 20), contact_url: evidence.find((page) => /contact|联系/i.test(new URL(page.url).pathname + " " + page.title))?.url || "UNKNOWN",
    evidence, reviewed_at: now,
  };
}
