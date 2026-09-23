// Feature flags. The CRM layer (sales, customers, follow-ups) is hidden for now (decision D-10);
// set VITE_FEATURE_CRM=1 to bring it back without code changes.
export const FEATURE_CRM = import.meta.env.VITE_FEATURE_CRM === '1'
