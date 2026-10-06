export type Provider = "dataforseo" | "hunter" | "prospeo" | "anthropic" | "website";

export interface ProviderCall {
  campaign: string;
  prospect: string | null;
  provider: Provider;
  operation: string;
  estimated_cost_eur: number;
  actual_cost_eur: number | null;
  /** Provider-native unit where useful (USD, credits, tokens). */
  native_cost: string | null;
  timestamp: string;
  result: "ok" | "empty" | "error" | "blocked_by_budget";
  detail?: string;
}

const effective = (c: Pick<ProviderCall, "estimated_cost_eur" | "actual_cost_eur">) => c.actual_cost_eur ?? c.estimated_cost_eur;

export class BudgetExceededError extends Error {
  constructor(public readonly needed: number, public readonly remaining: number) {
    super(`API budget exhausted: need €${needed.toFixed(4)}, remaining €${remaining.toFixed(4)}`);
    this.name = "BudgetExceededError";
  }
}

/**
 * Tracks every provider call and enforces the campaign budget BEFORE a paid call is made.
 * Spend is counted as the actual cost when the provider reports it, otherwise the estimate.
 */
export class CostTracker {
  readonly calls: ProviderCall[] = [];
  private spent = 0;
  /** Estimates reserved by guard() for calls still in flight (prevents concurrent overspend). */
  private reserved = 0;
  private readonly reservations = new Map<string, number[]>();
  private exhausted = false;

  constructor(readonly campaign: string, readonly maxBudgetEur: number) {}

  get spentEur(): number {
    return this.spent;
  }
  get remainingEur(): number {
    return Math.max(0, this.maxBudgetEur - this.spent - this.reserved);
  }
  get isExhausted(): boolean {
    return this.exhausted;
  }

  /** Throws BudgetExceededError if the estimate does not fit. Records the blocked attempt. */
  guard(provider: Provider, operation: string, prospect: string | null, estimateEur: number): void {
    if (this.exhausted || this.spent + this.reserved + estimateEur > this.maxBudgetEur + 1e-9) {
      this.exhausted = true;
      this.calls.push({
        campaign: this.campaign,
        prospect,
        provider,
        operation,
        estimated_cost_eur: estimateEur,
        actual_cost_eur: 0,
        native_cost: null,
        timestamp: new Date().toISOString(),
        result: "blocked_by_budget",
      });
      throw new BudgetExceededError(estimateEur, this.remainingEur);
    }
    const key = `${provider}|${operation}|${prospect}`;
    this.reservations.set(key, [...(this.reservations.get(key) ?? []), estimateEur]);
    this.reserved += estimateEur;
  }

  record(call: Omit<ProviderCall, "campaign" | "timestamp">): void {
    this.calls.push({ ...call, campaign: this.campaign, timestamp: new Date().toISOString() });
    const key = `${call.provider}|${call.operation}|${call.prospect}`;
    const pending = this.reservations.get(key);
    if (pending?.length) this.reserved = Math.max(0, this.reserved - pending.shift()!);
    this.spent += effective(call);
  }

  costForProspect(prospect: string): number {
    return this.calls
      .filter((c) => c.prospect === prospect)
      .reduce((s, c) => s + effective(c), 0);
  }

  byProvider(): Record<string, { calls: number; eur: number }> {
    const out: Record<string, { calls: number; eur: number }> = {};
    for (const c of this.calls) {
      const k = `${c.provider}:${c.operation}`;
      out[k] ??= { calls: 0, eur: 0 };
      out[k].calls += c.result === "blocked_by_budget" ? 0 : 1;
      out[k].eur += effective(c);
    }
    return out;
  }
}
