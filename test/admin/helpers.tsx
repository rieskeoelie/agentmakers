import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminStateProvider, type AdminState } from "../../src/components/admin/app/AdminContext.js";
import { copyFor } from "../../src/components/admin/app/copy.js";
import type { Lead } from "../../src/components/admin/app/model.js";
import { outreachApi } from "../../src/lib/outreach/ui/api.js";

const noop = () => undefined;

/** A complete, inert admin state. Network is never touched: the API client answers with empty JSON. */
export function fakeAdmin(over: Partial<AdminState> = {}): AdminState {
  const leads: Lead[] = over.leads ?? [];
  return {
    me: { userId: "u-super", displayName: "Richard", isAdmin: true, isSuperAdmin: true },
    t: copyFor("nl"), lang: "nl", setLang: noop,
    route: { screen: "overview" }, navigate: noop,
    viewAs: null, setViewAs: noop, canOperate: true,
    api: outreachApi(null, (async () => new Response("{}")) as typeof fetch),
    logout: noop, collapsed: false, setCollapsed: noop,
    pages: [], leads, visibleLeads: leads, visiblePages: [], crmLoading: false, crmError: null, refreshCrm: async () => undefined,
    setPages: noop, setLeads: noop,
    conversations: [], visibleConversations: [], convDetails: {}, convIndex: {}, convLoading: false, loadConversations: noop, loadConversationDetail: async () => undefined,
    accounts: [], accountsLoading: false, loadAccounts: noop,
    leadStatus: {}, setLeadStatus: noop, leadNotes: {}, setLeadNote: noop, handled: new Set(), toggleHandled: noop, seen: new Set(), markLeadsSeen: noop,
    counts: { review: 3, inbox: 2, newLeads: 1, sendingLive: false }, refreshCounts: noop,
    ...over,
  };
}

export const renderWith = (state: AdminState, el: ReactElement) => renderToStaticMarkup(<AdminStateProvider value={state}>{el}</AdminStateProvider>);
export const count = (s: string, needle: string) => s.split(needle).length - 1;
