// Feature flags. The CRM layer (sales, customers, follow-ups) is hidden for now (decision D-10);
// set VITE_FEATURE_CRM=1 to bring it back without code changes.
export const FEATURE_CRM = import.meta.env.VITE_FEATURE_CRM === '1'

// Project economics (units / effect, land compensation, fixed monthly costs, margin).
// On for testing; VITE_FEATURE_ECONOMICS=0 hides it again.
export const FEATURE_ECONOMICS = import.meta.env.VITE_FEATURE_ECONOMICS !== '0'
