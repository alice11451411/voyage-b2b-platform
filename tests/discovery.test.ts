import assert from "node:assert/strict";
import test from "node:test";
import { buildSearchQuery, DiscoveryError, isPublicAddress, searchPublicCompanies, verifyWebsite } from "../src/lib/discovery.ts";
import { createDemoState } from "../src/data/demo.ts";

const input = { project: createDemoState().project, keywords: "hotpot soup base", country: "United States", buyer_types: "Importer Distributor" };
const publicDns = async () => [{ address: "93.184.216.34", family: 4 }];

test("third-party directory pages cannot be recorded as one company's official website", async () => {
  let reads = 0;
  const network = { resolve: publicDns, read: async () => { reads++; return { status: 200, headers: { "content-type": "text/html" }, body: "<title>Directory company</title>" }; } };
  for (const url of ["https://www.unisco.com/importers/first-company", "https://www.linkedin.com/company/first-company", "https://www.alibaba.com/company/a"]) await assert.rejects(verifyWebsite(url, network), /目录|平台/);
  assert.equal(reads, 0);
});

test("search uses explicit product, market and buyer terms", () => {
  assert.equal(buildSearchQuery(input), "hotpot soup base United States Importer Distributor official website contact");
  assert.throws(() => buildSearchQuery({ ...input, keywords: "" }), /关键词/);
});

test("search parses Exa MCP text results and never substitutes seed companies", async () => {
  const mock = async () => new Response(JSON.stringify({ result: { content: [{ type: "text", text: "Title: Actual Foods\nURL: https://actual-foods.test/\nText: Asian food importer\n\nTitle: Another\nURL: https://another.test/\nText: Distribution" }] } }), { status: 200 });
  const result = await searchPublicCompanies(input, mock);
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].url, "https://actual-foods.test/");
  assert.equal(result.results[0].title, "Actual Foods");
});

test("search treats successful HTTP with provider rate limit as an explicit failure", async () => {
  const mock = async () => new Response(JSON.stringify({ result: { _meta: { "ai.exa/rateLimited": true }, content: [] } }));
  await assert.rejects(searchPublicCompanies(input, mock), (e: unknown) => e instanceof DiscoveryError && e.status === 429);
  await assert.rejects(searchPublicCompanies(input, async () => new Response(JSON.stringify({ result: { content: [] } }))), /没有返回/);
});

test("private, loopback, metadata, mapped and reserved addresses are denied", () => {
  for (const address of ["127.0.0.1", "10.1.1.1", "100.64.1.2", "169.254.169.254", "172.31.1.1", "192.168.0.1", "0.0.0.0", "198.18.0.1", "224.0.0.1", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "2001:db8::1"]) assert.equal(isPublicAddress(address), false, address);
  for (const address of ["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"]) assert.equal(isPublicAddress(address), true, address);
});

test("website rejects credentials, protocols, IP literals and mixed private DNS before reading", async () => {
  let calls = 0;
  const read = async () => { calls++; return { status: 200, headers: { "content-type": "text/html" }, body: "<title>Good</title>" }; };
  for (const url of ["file:///etc/passwd", "http://127.0.0.1", "http://[::1]", "https://u:p@example.test", "http://localhost", "http://example.test:4000"]) await assert.rejects(verifyWebsite(url, { resolve: publicDns, read }));
  await assert.rejects(verifyWebsite("https://example.test", { resolve: async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.1.1.1", family: 4 }], read }), /公网/);
  assert.equal(calls, 0);
});

test("verification reads same-origin contact page, records source and never guesses email", async () => {
  const calls: string[] = [];
  const review = await verifyWebsite("https://foods.test/", { resolve: publicDns, read: async (url, address) => {
    calls.push(url.href); assert.equal(address.address, "93.184.216.34");
    return { status: 200, headers: { "content-type": "text/html" }, body: url.pathname === "/" ? '<title>Foods Company | Home</title><script>secret@wrong.test</script><h1>Foods</h1><p>Importer of Asian foods</p><a href="/contact">Contact us</a><a href="https://other.test/contact">Other</a>' : '<title>Contact</title><p>Email sales@foods.test</p><a href="mailto:export@foods.test">Email</a><img src="logo@2x.png"><p>Our public office</p>' };
  } });
  assert.deepEqual(calls, ["https://foods.test/", "https://foods.test/contact"]);
  assert.equal(review.company_name, "Foods Company");
  assert.equal(review.country, "UNKNOWN");
  assert.deepEqual(review.public_emails.map((item) => item.email), ["sales@foods.test", "export@foods.test"]);
  assert.equal(review.public_emails[0].source_url, "https://foods.test/contact");
  assert.equal(review.evidence.length, 2);
  assert.doesNotMatch(JSON.stringify(review), /secret@wrong|logo@2x/);
});

test("redirects revalidate DNS and refuse external origins", async () => {
  let reads = 0;
  await assert.rejects(verifyWebsite("https://foods.test", { resolve: publicDns, read: async () => { reads++; return { status: 302, headers: { location: "https://other.test/" }, body: "" }; } }), /跨站/);
  assert.equal(reads, 1);
  let resolves = 0;
  await assert.rejects(verifyWebsite("https://foods.test", { resolve: async () => (++resolves === 1 ? await publicDns() : [{ address: "127.0.0.1", family: 4 }]), read: async () => ({ status: 302, headers: { location: "/new" }, body: "" }) }), /公网/);
});

test("canonical www redirect stays on the same domain and footer email remains public evidence", async () => {
  const review = await verifyWebsite("http://www.foods.test", { resolve: publicDns, read: async (url) => url.protocol === "http:" ? { status: 301, headers: { location: "https://foods.test/" }, body: "" } : { status: 200, headers: { "content-type": "text/html" }, body: '<title>Foods</title><p>Food distribution</p><footer>Email wholesale@foods.test</footer>' } });
  assert.equal(review.website, "https://foods.test/");
  assert.equal(review.public_emails[0].email, "wholesale@foods.test");
});

test("unreadable, blocked and oversized website pages do not yield verified data", async () => {
  for (const page of [
    { status: 403, headers: { "content-type": "text/html" }, body: "blocked" },
    { status: 200, headers: { "content-type": "text/html" }, body: "Verify you are human captcha" },
    { status: 200, headers: { "content-type": "application/pdf" }, body: "%PDF" },
    { status: 200, headers: { "content-type": "text/html" }, body: "x".repeat(512 * 1024 + 1) },
  ]) await assert.rejects(verifyWebsite("https://foods.test", { resolve: publicDns, read: async () => page }));
});
