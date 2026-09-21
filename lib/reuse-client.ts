import type { Vendor } from './client';

export type CatalogCustomer = Vendor['customers'][number] & {
  date?: string;
  capturedAt?: string;
  shopping?: number;
  support?: number;
  sourceReportSlug?: string;
  reusable?: boolean;
  expiresAt?: string;
  analyses?: Partial<Record<'shopping' | 'support', { date?: string; capturedAt?: string; score: number; sourceReportSlug?: string; reusable?: boolean; expiresAt?: string }>>;
};
export type CatalogProvider = {
  name: string;
  website: string;
  customers: CatalogCustomer[];
  latestAnalysisAt?: string;
};
export type ReusePreview = {
  reusedConversations: number;
  newConversations: number;
  reusedStores: number;
  newStores: number;
  existingReport?: { slug: string; title: string };
  previousReport?: { slug: string; title: string };
};
export type FilledFields = Record<string, string>;

const nameKey = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
export function websiteKey(value: string, storefront = false) {
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    return `${url.hostname.toLowerCase().replace(/^www\./, '')}${url.port ? `:${url.port}` : ''}${storefront ? `${url.pathname}${url.search}` : ''}`;
  } catch { return ''; }
}
export function matchesProvider(value: Pick<Vendor, 'name' | 'website'>, provider: CatalogProvider) {
  const name = nameKey(value.name), website = value.website.trim();
  return Boolean(name || website) && (!name || name === nameKey(provider.name)) &&
    (!website || (websiteKey(website) !== '' && websiteKey(website) === websiteKey(provider.website)));
}
export function certainProvider(value: Vendor, providers: CatalogProvider[]) {
  const matches = providers.filter(provider => matchesProvider(value, provider));
  return matches.length === 1 ? matches[0] : undefined;
}
export function providerLookupQuery(value: Pick<Vendor, 'name' | 'website'>) {
  return value.name.trim() || websiteKey(value.website);
}

// Only fill blank, untouched fields. A partially entered customer must itself
// match, otherwise a catalog result could attach the wrong URL to a user's name.
export function fillKnownProvider(value: Vendor, provider: CatalogProvider, edited: ReadonlySet<string>) {
  const next: Vendor = { ...value, customers: value.customers.map(customer => ({ ...customer })) };
  const filled: FilledFields = {};
  for (const field of ['name', 'website'] as const) {
    if (!next[field].trim() && !edited.has(field)) {
      next[field] = provider[field]; filled[field] = provider[field];
    }
  }
  const hosts = new Map<string, Set<number>>();
  const names = new Map<string, Set<number>>();
  const customerHost = (website: string) => websiteKey(website).replace(/:\d+$/, '');
  const reserve = (customer: Vendor['customers'][number], index: number) => {
    for (const [map, key] of [[hosts, customerHost(customer.website)], [names, nameKey(customer.name)]] as const) {
      if (!key) continue;
      const owners = map.get(key) || new Set<number>(); owners.add(index); map.set(key, owners);
    }
  };
  const available = (customer: Vendor['customers'][number], index: number) => {
    const host = customerHost(customer.website), name = nameKey(customer.name);
    return Boolean(host && name) && [hosts.get(host), names.get(name)].every(owners => !owners || [...owners].every(owner => owner === index));
  };
  const fillCustomer = (customer: Vendor['customers'][number], known: CatalogCustomer, index: number) => {
    for (const field of ['name', 'website'] as const) {
      const key = `customers.${index}.${field}`;
      if (!customer[field].trim() && !edited.has(key)) {
        customer[field] = known[field]; filled[key] = known[field];
      }
    }
  };
  next.customers.forEach(reserve);
  const partialMatches = new Map<number, CatalogCustomer>();
  // Resolve every partially entered row before filling empty slots. This keeps
  // an earlier empty slot from taking a storefront already named in a later row.
  next.customers.forEach((customer, index) => {
    if (!customer.name.trim() && !customer.website.trim()) return;
    const options = provider.customers.filter(known => {
      const key = websiteKey(known.website, true);
      if (!key) return false;
      return (!customer.name.trim() || nameKey(customer.name) === nameKey(known.name)) &&
        (!customer.website.trim() || websiteKey(customer.website, true) === key);
    });
    if (options.length === 1) {
      partialMatches.set(index, options[0]); reserve(options[0], index);
    }
  });
  for (const [index, known] of partialMatches) {
    if (available(known, index)) fillCustomer(next.customers[index], known, index);
  }
  next.customers.forEach((customer, index) => {
    if (customer.name.trim() || customer.website.trim() || edited.has(`customers.${index}.name`) || edited.has(`customers.${index}.website`)) return;
    // Match submission validation: regional URLs on one hostname and repeated
    // customer names do not count as distinct customer companies.
    const known = provider.customers.find(candidate => available(candidate, index));
    if (!known) return;
    fillCustomer(customer, known, index); reserve(known, index);
  });
  return { value: next, filled };
}

export function removeAutofill(value: Vendor, filled: FilledFields): Vendor {
  const next = { ...value, customers: value.customers.map(customer => ({ ...customer })) };
  for (const [key, previous] of Object.entries(filled)) {
    if (key === 'name' || key === 'website') {
      if (next[key] === previous) next[key] = '';
    } else {
      const [, index, field] = key.split('.');
      if ((field === 'name' || field === 'website') && next.customers[Number(index)]?.[field] === previous) next.customers[Number(index)][field] = '';
    }
  }
  return next;
}
