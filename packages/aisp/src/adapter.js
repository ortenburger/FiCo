/**
 * AISP connector boundary — READ ONLY.
 * Compile-time invariant: no PISP / payment-initiation methods exist.
 */
/**
 * Stub connector for local/dev. Real adapters must live in workers and
 * publish raw JSON to Redis Streams — never call HTTP inside @Transactional.
 */
export class StubAispConnector {
    name = "FINAPI";
    async fetchTransactions() {
        return { items: [] };
    }
    async fetchAccounts() {
        return [];
    }
}
//# sourceMappingURL=adapter.js.map