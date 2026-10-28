import type { Project } from "./types.ts";

export interface SearchCandidate { url: string; title: string; snippet: string }
export interface SearchResult { query: string; provider: string; results: SearchCandidate[]; searched_at: string }
export interface SearchInput { project: Project; keywords: string; country: string; buyer_types: string }
export interface WebsiteReview {
  website: string;
  company_name: string;
  country: string;
  company_type: string;
  main_products: string;
  distribution_channel: string;
  public_emails: { email: string; source_url: string }[];
  contact_url: string;
  evidence: { url: string; title: string; snippet: string; retrieved_at: string }[];
  reviewed_at: string;
}
