/** 仅负责中文显示；原始资料、英文邮件和业务枚举保持原文。 */
const countries: Record<string, string> = {
  "United States": "美国", US: "美国", USA: "美国", "United States of America": "美国",
  Canada: "加拿大", Germany: "德国",
};

const cities: Record<string, string> = {
  "Los Angeles, CA": "洛杉矶，加利福尼亚州",
  "New York, NY": "纽约，纽约州",
  "Austin, TX": "奥斯汀，得克萨斯州",
  "Seattle, WA": "西雅图，华盛顿州",
  "San Francisco, CA": "旧金山，加利福尼亚州",
  "Chicago, IL": "芝加哥，伊利诺伊州",
  "Houston, TX": "休斯敦，得克萨斯州",
  "Boston, MA": "波士顿，马萨诸塞州",
  "Portland, OR": "波特兰，俄勒冈州",
  "San Diego, CA": "圣迭戈，加利福尼亚州",
  "Denver, CO": "丹佛，科罗拉多州",
  "Miami, FL": "迈阿密，佛罗里达州",
  "Phoenix, AZ": "菲尼克斯，亚利桑那州",
  "Minneapolis, MN": "明尼阿波利斯，明尼苏达州",
  "Atlanta, GA": "亚特兰大，佐治亚州",
  "Dallas, TX": "达拉斯，得克萨斯州",
};

const companyTypes: Record<string, string> = {
  Importer: "进口商", Distributor: "经销商", "Importer / Distributor": "进口商 / 经销商",
  "Private Label Brand": "自有品牌商", "Asian Grocery Chain": "亚洲超市连锁",
  "Foodservice Distributor": "餐饮供应链", Wholesaler: "批发商", "Asian Food Importer": "亚洲食品进口商",
  "Asian Food Importer / Distributor / Private Label Brand / Asian Grocery Chain": "亚洲食品进口商、经销商、自有品牌商、亚洲超市连锁",
};

const jobTitles: Record<string, string> = {
  "Head of Purchasing": "采购负责人", "Category Director": "品类总监",
  "Sourcing Manager": "供应商寻源经理", "Procurement Manager": "采购经理",
  "Category Buyer": "品类采购", "Purchasing Director": "采购总监", Founder: "创始人",
  "Purchasing Coordinator": "采购协调员", Buyer: "采购员", "Operations Manager": "运营经理",
  "Customer Service": "客户服务", "Sales Representative": "销售代表",
};

const products: Record<string, string> = {
  "Hotpot bases, chili sauces, Asian seasonings": "火锅底料、辣酱、亚洲调味料",
  "Asian sauces, soup bases, specialty groceries": "亚洲酱料、汤底、特色食品",
  "Private label chili sauces and cooking sauces": "自有品牌辣酱与烹饪酱料",
  "Chinese condiments, hotpot bases, dried ingredients": "中式调味品、火锅底料、干货食材",
  "Asian sauces, frozen food, hotpot ingredients": "亚洲酱料、冷冻食品、火锅食材",
  "Chinese sauces, noodles, seasoning blends": "中式酱料、面条、复合调味料",
  "Hotpot bases, chili oil, Chinese pantry products": "火锅底料、辣椒油、中式常备食品",
  "Asian cooking sauces, soup mixes": "亚洲烹饪酱料、汤料",
  "OEM cooking sauces, Asian seasoning blends": "代工贴牌烹饪酱料、亚洲复合调味料",
  "Chili sauces, dry groceries, noodles": "辣酱、干货食品、面条",
  "Soup stocks, general seasonings, restaurant staples": "高汤、常规调味料、餐饮常用食材",
  "International condiments and shelf-stable groceries": "各国调味品与常温食品",
  "General snacks, beverages, cooking sauces": "常规零食、饮料、烹饪酱料",
  "Baking flour, grains, dry staples": "烘焙面粉、谷物、干货主食",
  "Breakfast cereals, sweet snacks": "早餐谷物、甜味零食",
  "Frozen seafood and ice cream": "冷冻海鲜与冰淇淋",
  "火锅底料 / Hotpot Soup Base": "火锅底料", "Hotpot Soup Base": "火锅底料",
  "Asian seasonings / 亚洲复合调味料": "亚洲复合调味料", "Asian seasonings": "亚洲调味料",
};

const channels: Record<string, string> = {
  "Asian grocery stores and regional wholesalers": "亚洲食品商店与区域批发商",
  "East Coast Asian supermarkets": "美国东海岸亚洲超市",
  "Retail private label and online grocery": "零售自有品牌与线上食品零售",
  "Independent Asian grocery stores": "独立亚洲食品商店",
  "Regional Asian grocery chain": "区域亚洲超市连锁",
  "Midwest grocery and foodservice": "美国中西部食品零售与餐饮渠道",
  "Asian grocery and restaurant supply": "亚洲食品零售与餐饮供应",
  "Specialty grocery retailers": "特色食品零售商",
  "Private label grocery brands": "食品零售自有品牌",
  "Local Asian supermarkets": "本地亚洲超市",
  "Restaurants and catering kitchens": "餐厅与餐饮服务厨房",
  "Independent grocery retailers": "独立食品零售商",
  "Convenience and specialty retail": "便利店与特色商品零售",
  "Bakeries and general food wholesalers": "烘焙店与综合食品批发商",
  "Online retail": "线上零售", "Cold chain foodservice": "冷链餐饮供应",
};

const fits: Record<string, string> = {
  HIGH: "高", MEDIUM: "中", LOW: "低", UNKNOWN: "待确认",
  Strong: "高度匹配", Medium: "部分匹配", Weak: "匹配较弱", "No Fit": "不匹配",
};

const priorities: Record<string, string> = {
  A: "A · 优先联系", B: "B · 补充资料", C: "C · 暂缓培育", Disqualified: "暂不联系",
};

const labels: Record<string, string> = {
  UNKNOWN: "待补充", "NO VERIFIED INTENT SIGNAL": "暂无已核验的采购时机信号",
  NO_VERIFIED_SIGNAL: "暂无已核验的采购时机信号",
  "INSUFFICIENT DATA": "资料不足，补充后再判断", "Demo Dataset": "演示数据",
  "Lead Score": "客户评分", "ICP Fit": "目标客户匹配度", "Product Fit": "产品相关性",
  "Decision Maker": "采购决策权限", "Intent / Timing": "采购时机信号", "Data Confidence": "资料可信度",
  "Human Review": "人工审核", Approved: "审核通过", "Mark as Sent": "模拟发送",
  "Outreach Draft": "首封开发信", "Follow-up": "跟进邮件", "Follow-up Overdue": "跟进已逾期",
  Insight: "联系依据", Relevance: "产品关联", Proof: "能力依据", "Soft CTA": "下一步邀请",
  FACT: "已记录事实", HYPOTHESIS: "待验证判断", RECOMMENDATION: "行动建议",
  ...countries, ...cities, ...companyTypes, ...jobTitles, ...products, ...channels,
};

function fieldLabel(value: string | null | undefined, dictionary: Record<string, string>): string {
  const text = value?.trim() || "";
  if (!text || text === "UNKNOWN") return "待补充";
  return dictionary[text] || (/^[\x00-\x7F]+$/.test(text) ? `${text}（待确认）` : text);
}

export const countryLabel = (value: string | null | undefined) => fieldLabel(value, countries);
export const cityLabel = (value: string | null | undefined) => fieldLabel(value, cities);
export function companyTypeLabel(value: string | null | undefined): string {
  const text = value?.trim() || "";
  if (!text.includes("/") || companyTypes[text]) return fieldLabel(text, companyTypes);
  return text.split("/").map(part => fieldLabel(part.trim(), companyTypes)).join("、");
}
export const jobTitleLabel = (value: string | null | undefined) => fieldLabel(value, jobTitles);
export const productsLabel = (value: string | null | undefined) => fieldLabel(value, products);
export const channelLabel = (value: string | null | undefined) => fieldLabel(value, channels);
export const fitLabel = (value: string | null | undefined) => fits[value || "UNKNOWN"] || fieldLabel(value, fits);
export const priorityLabel = (value: string | null | undefined) => priorities[value || ""] || "暂不可评估";

const knownPhrases = Object.entries(labels).sort(([a], [b]) => b.length - a.length);

/** 翻译已确认的固定资料短语；不猜测翻译其他文本或专有名称。 */
export function valueLabel(value: string | null | undefined): string {
  const text = value?.trim() || "";
  if (!text) return "待补充";
  if (labels[text]) return labels[text];
  let translated = text;
  for (const [original, label] of knownPhrases) {
    // 单个词可能出现在公司名、网址或未知资料里，只在精确匹配时翻译。
    if (original.includes(" ") || original.includes(",")) translated = translated.replaceAll(original, label);
  }
  return translated;
}

const chinaDate = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
});
const chinaDateTime = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calendarDay(date: Date): number {
  const parts = chinaDate.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day")) / 86_400_000;
}

/** 跟进日期按中国日历日表达，跨午夜不按不足 24 小时计算。 */
export function relativeDate(value: string | Date | null | undefined, now = new Date()): string {
  const date = parseDate(value);
  if (!value) return "未安排跟进";
  if (!date || Number.isNaN(now.getTime())) return "日期待确认";
  const days = calendarDay(date) - calendarDay(now);
  if (days < 0) return `已逾期 ${-days} 天`;
  if (days === 0) return "今天";
  if (days === 1) return "明天";
  if (days === 2) return "后天";
  return `${days} 天后`;
}

/** 用于日期旁的 title 或详细说明，始终采用中国时区。 */
export function fullDate(value: string | Date | null | undefined): string {
  const date = parseDate(value);
  if (!value) return "未安排跟进";
  if (!date) return "日期待确认";
  return `${chinaDateTime.format(date)}（中国时间）`;
}
