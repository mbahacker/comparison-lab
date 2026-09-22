/**
 * What each vendor publicly offers beyond the on-site chat widget that studies test.
 * Editorial reference data from each vendor's own website, not study results; every "yes"
 * cell links to the page that states it. Absence is reported as "not listed", never as a
 * claim that a vendor lacks something. Re-check sources and update the date before editing.
 */
export const PRODUCT_SCOPE_CHECKED_AT = '2026-09-22';

export type ScopeStatus = 'yes' | 'integration' | 'not-listed';
export type ScopeCell = { status: ScopeStatus; product?: string; source?: string };
/** tested: measured by studies; 'partly': exercised inside chat conversations but not scored on its own. */
export type CapabilityRow = { key: string; label: string; phrase: string; tested: boolean | 'partly' };
export type VendorScope = { id: string; name: string; domain: string; cells: Record<string, ScopeCell> };
export type Offering = { title: string; description: string; href: string };

export const CAPABILITIES: CapabilityRow[] = [
  { key: 'shoppingChat', label: 'AI shopping assistant in the on-site chat widget', phrase: 'an AI shopping assistant in the chat widget', tested: true },
  { key: 'supportChat', label: 'AI support agent in the on-site chat widget', phrase: 'an AI support agent in the chat widget', tested: true },
  { key: 'aiVisibility', label: 'AI visibility in answer engines (AEO/GEO)', phrase: 'AI visibility tools for answer engines (AEO/GEO)', tested: false },
  { key: 'productFaqs', label: 'AI-written FAQs on product pages', phrase: 'AI-written FAQs on product pages', tested: false },
  { key: 'search', label: 'Conversational product search', phrase: 'conversational product search', tested: 'partly' },
  { key: 'guided', label: 'Guided and visual shopping (shade matching, similar products, virtual try-on)', phrase: 'guided and visual shopping such as shade matching and virtual try-on', tested: false },
  { key: 'nudges', label: 'Proactive nudges and offers', phrase: 'proactive nudges and offers', tested: false },
  { key: 'helpdesk', label: 'Helpdesk and ticketing for human agents', phrase: 'a helpdesk for human agents', tested: false },
  { key: 'helpCenter', label: 'Help center', phrase: 'a help center', tested: false },
  { key: 'email', label: 'Email support', phrase: 'email support', tested: false },
  { key: 'sms', label: 'SMS', phrase: 'SMS', tested: false },
  { key: 'voice', label: 'Voice', phrase: 'voice', tested: false },
  { key: 'whatsapp', label: 'WhatsApp', phrase: 'WhatsApp', tested: false },
  { key: 'social', label: 'Instagram and Facebook', phrase: 'Instagram and Facebook', tested: false },
  { key: 'platforms', label: 'Commerce platforms listed', phrase: 'commerce platform integrations', tested: false },
];

const A = 'https://alhena.ai', G = 'https://www.gorgias.com';
export const VENDOR_SCOPES: VendorScope[] = [
  { id: 'alhena', name: 'Alhena', domain: 'alhena.ai', cells: {
    shoppingChat: { status: 'yes', product: 'AI Shopping Assistant', source: `${A}/products/ai-shopping-assistant` },
    supportChat: { status: 'yes', product: 'AI Support Concierge', source: `${A}/products/ai-support-concierge` },
    aiVisibility: { status: 'yes', product: 'AI Visibility', source: `${A}/products/ai-visibility` },
    productFaqs: { status: 'yes', product: 'Smart FAQs and the AEO FAQ Engine', source: `${A}/` },
    search: { status: 'yes', product: 'Conversational Search', source: `${A}/products/ai-shopping-assistant` },
    guided: { status: 'yes', product: 'Guided Discovery, Shade Matcher, Similar Product Finder, virtual try-ons', source: `${A}/solutions/industries/beauty-and-skincare` },
    nudges: { status: 'yes', product: 'Conversion Nudges', source: `${A}/products/ai-shopping-assistant` },
    helpdesk: { status: 'integration', product: 'Zendesk, Gorgias, Salesforce Service Cloud, Freshdesk and more', source: `${A}/integrations` },
    helpCenter: { status: 'not-listed' },
    email: { status: 'yes', product: 'Email integration', source: `${A}/integrations/email` },
    sms: { status: 'integration', product: 'through a connected helpdesk', source: `${A}/integrations/gorgias` },
    voice: { status: 'yes', product: 'Voice AI', source: `${A}/products/voice-ai` },
    whatsapp: { status: 'yes', product: 'AI Social Commerce', source: `${A}/products/ai-social-commerce` },
    social: { status: 'yes', product: 'AI Social Commerce', source: `${A}/products/ai-social-commerce` },
    platforms: { status: 'yes', product: 'Shopify, WooCommerce, Salesforce Commerce Cloud', source: `${A}/integrations` },
  } },
  { id: 'gorgias', name: 'Gorgias', domain: 'gorgias.com', cells: {
    shoppingChat: { status: 'yes', product: 'AI Shopping Assistant', source: `${G}/ai-shopping-assistant` },
    supportChat: { status: 'yes', product: 'AI Agent', source: `${G}/ai-agent` },
    aiVisibility: { status: 'not-listed' },
    productFaqs: { status: 'not-listed' },
    search: { status: 'yes', product: 'Search to revenue, in the AI Shopping Assistant', source: `${G}/ai-shopping-assistant` },
    guided: { status: 'not-listed' },
    nudges: { status: 'yes', product: 'Convert', source: `${G}/product/convert` },
    helpdesk: { status: 'yes', product: 'Helpdesk', source: `${G}/product/helpdesk` },
    helpCenter: { status: 'yes', product: 'Help Center', source: `${G}/product/help-center` },
    email: { status: 'yes', product: 'Helpdesk', source: `${G}/product/helpdesk` },
    sms: { status: 'yes', product: 'SMS', source: `${G}/product/sms` },
    voice: { status: 'yes', product: 'Voice', source: `${G}/products/voice` },
    whatsapp: { status: 'yes', product: 'WhatsApp', source: `${G}/product/whatsapp` },
    social: { status: 'yes', product: 'Social media', source: `${G}/product/social-media` },
    platforms: { status: 'yes', product: 'Shopify, BigCommerce, Magento, WooCommerce, PrestaShop', source: `${G}/pricing` },
  } },
];

/** Alhena offerings outside what the study scored, described in the words of alhena.ai. */
const ALHENA_NOT_COMPARED: Offering[] = [
  { title: 'AI Visibility (AEO/GEO)', description: 'Measures how your products appear inside AI-generated shopping answers and gives product-level actions to improve visibility.', href: `${A}/products/ai-visibility` },
  { title: 'Smart FAQs and the AEO FAQ Engine', description: 'AI-written answers embedded on every product page, plus citation-ready Q&A pairs built for answer engines.', href: `${A}/` },
  { title: 'Conversational Search', description: 'Natural-language product search for layered queries. The study’s shopping conversations asked product questions but did not score search on its own.', href: `${A}/products/ai-shopping-assistant` },
  { title: 'Guided and visual shopping', description: 'Guided Discovery, Shade Matcher, Similar Product Finder, and virtual try-ons for fit and color.', href: `${A}/solutions/industries/beauty-and-skincare` },
];

const host = (website: string) => { try { return new URL(website).hostname.replace(/^www\./, ''); } catch { return ''; } };
export function vendorScope(website: string): VendorScope | undefined {
  const h = host(website);
  return VENDOR_SCOPES.find(v => v.domain === h);
}
export function notComparedOfferings(): Offering[] { return ALHENA_NOT_COMPARED; }
/** Scope entries for every provider, or null when any provider has none (the table would be one-sided). */
export function scopesFor(providers: { website: string }[]): VendorScope[] | null {
  const scopes = providers.map(p => vendorScope(p.website));
  return scopes.length > 0 && scopes.every(Boolean) ? scopes as VendorScope[] : null;
}
/** Untested capabilities a vendor sells itself while no other vendor in the comparison does. */
export function exclusiveOfferings(vendor: VendorScope, others: VendorScope[]): CapabilityRow[] {
  return CAPABILITIES.filter(row => row.tested === false && vendor.cells[row.key]?.status === 'yes' && others.every(o => o.cells[row.key]?.status !== 'yes'));
}
/** Untested capabilities a vendor covers only through integrations. */
export function integrationOnly(vendor: VendorScope): CapabilityRow[] {
  return CAPABILITIES.filter(row => row.tested === false && vendor.cells[row.key]?.status === 'integration');
}
export function phraseList(rows: CapabilityRow[]) {
  const items = rows.map(r => r.phrase);
  return items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}
