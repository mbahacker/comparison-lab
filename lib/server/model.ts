export type Customer = { name: string; website: string };
export type Provider = Customer & { customers: Customer[] };
export type RequestStatus = 'pending_review' | 'queued' | 'running' | 'published' | 'rejected' | 'needs_review' | 'failed';
export type User = { id: string; name: string; email: string };
export type ComparisonRequest = {
  id: string; status: RequestStatus; providers: Provider[]; createdAt: string;
  updatedAt: string; reviewedAt: string | null; reviewNote: string | null;
  reportSlug: string | null; error: string | null; notes: string | null;
};
export type Row = Record<string, any>;
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
