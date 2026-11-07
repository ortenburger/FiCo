"""
FiCo FastMCP server — exposes the full FL-NTOE HTTP surface as MCP tools.

Run (stdio, for Cursor / Claude Desktop):
  FICO_API_BASE=http://127.0.0.1:3001 uv run --directory mcp fico-mcp

Or HTTP transport for remote agents:
  uv run --directory mcp fico-mcp --transport http --port 8765
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastmcp import FastMCP

from fico_mcp.client import demo_user_id, request

mcp = FastMCP(
    name="FiCo",
    instructions=(
        "FiCo is the Autonomous Financial Ledger & Net-Tariff Orchestration Engine "
        "(FL-NTOE). Prefer demo tools against the seeded Lena user when exploring. "
        "WpIG: never recommend specific securities/ISINs — macro allocation only. "
        "VAG: never allow cancellation letters before POLICY_ISSUED."
    ),
)

PolicyType = Literal[
    "BU_DISABILITY",
    "PENSION_PRIVATE",
    "PROPERTY_CASUALTY",
    "LIFE",
    "HEALTH",
    "OTHER",
]
SubscriptionTier = Literal["FREE", "ACTIVE_SUBSCRIBER"]
NetProvider = Literal["HONORARKONZEPT", "CONFEE"]


# ── Health / catalog ─────────────────────────────────────────────────────────


@mcp.tool
async def fico_health() -> dict[str, Any]:
    """Ping the FiCo API health endpoint."""
    return await request("GET", "/health")


@mcp.tool
async def list_datasources() -> dict[str, Any]:
    """List Open Finance, finexpert, finanzmining, and net-tariff datasources."""
    return await request("GET", "/v1/datasources")


@mcp.tool
async def get_datasource(
    datasource_id: Annotated[str, "Datasource id from list_datasources"],
) -> dict[str, Any]:
    """Fetch one registered datasource catalog entry."""
    return await request("GET", f"/v1/datasources/{datasource_id}")


# ── Demo persona (Lena) ──────────────────────────────────────────────────────


@mcp.tool
async def get_demo_snapshot(
    user_id: Annotated[
        str | None,
        "Demo user UUID (defaults to seeded Lena Demo)",
    ] = None,
) -> dict[str, Any]:
    """Full demo snapshot: accounts, policies, waterfall, boss fight, gamification."""
    return await request(
        "GET",
        "/v1/demo/snapshot",
        params={"userId": user_id or demo_user_id()},
    )


@mcp.tool
async def demo_check_in(
    user_id: Annotated[str | None, "Demo user UUID"] = None,
    snack_slug: Annotated[
        str | None,
        "Optional financial snack slug to complete on check-in",
    ] = None,
) -> dict[str, Any]:
    """Weekly demo check-in — awards XP / streak (and optional snack)."""
    body: dict[str, Any] = {"userId": user_id or demo_user_id()}
    if snack_slug:
        body["snackSlug"] = snack_slug
    return await request("POST", "/v1/demo/check-in", json=body)


# ── Regulatory / ledger / policy ─────────────────────────────────────────────


@mcp.tool
async def ask_copilot(
    query: Annotated[str, "Macro allocation / financial question (no ISINs)"],
) -> dict[str, Any]:
    """WpIG-guarded copilot query. Specific securities are hard-blocked."""
    return await request("POST", "/v1/copilot/query", json={"query": query})


@mcp.tool
async def evaluate_waterfall(
    fixed_cost_sum_lookback: Annotated[
        float,
        "Sum of FIXED_COST over the lookback window (e.g. 3 months)",
    ],
    liquid_checking: Annotated[float, "Checking account balance EUR"],
    liquid_savings: Annotated[float, "Savings / Tagesgeld balance EUR"] = 0.0,
    target_buffer_months: Annotated[float, "Emergency buffer months"] = 3.0,
) -> dict[str, Any]:
    """Cash-buffer waterfall: FILL_EMERGENCY_RESERVE / DEBT / WEALTH_ENGINE."""
    return await request(
        "POST",
        "/v1/ledger/waterfall",
        json={
            "fixedCostSumLookback": fixed_cost_sum_lookback,
            "targetBufferMonths": target_buffer_months,
            "accounts": [
                {"type": "CHECKING", "balanceAmount": liquid_checking},
                {"type": "SAVINGS", "balanceAmount": liquid_savings},
            ],
        },
    )


@mcp.tool
async def evaluate_policy_gate(
    policy_type: Annotated[PolicyType, "Insurance policy type"],
    subscription_tier: Annotated[
        SubscriptionTier,
        "FREE shows preview; ACTIVE_SUBSCRIBER unlocks finexpert",
    ] = "ACTIVE_SUBSCRIBER",
) -> dict[str, Any]:
    """Economic gate before finexpert / Franke & Bornberg synopsis calls."""
    return await request(
        "POST",
        "/v1/policy/economic-gate",
        json={
            "policyType": policy_type,
            "subscriptionTier": subscription_tier,
        },
    )


@mcp.tool
async def evaluate_sca_health(
    sca_valid_until: Annotated[str, "ISO datetime when SCA consent expires"],
    last_booking_date: Annotated[
        str | None,
        "Optional ISO date of last booking",
    ] = None,
) -> dict[str, Any]:
    """AISP Strong Customer Authentication consent health check."""
    params: dict[str, Any] = {"scaValidUntil": sca_valid_until}
    if last_booking_date:
        params["lastBookingDate"] = last_booking_date
    return await request("GET", "/v1/aisp/sca-health", params=params)


# ── Net tariffs ──────────────────────────────────────────────────────────────


@mcp.tool
async def list_net_tariffs(
    provider: Annotated[NetProvider | None, "HONORARKONZEPT or CONFEE"] = None,
    line: Annotated[str | None, "Product line filter"] = None,
    search: Annotated[str | None, "Free-text search"] = None,
    limit: Annotated[int, "Max products to return"] = 8,
) -> dict[str, Any]:
    """List Nettoprodukte from HonorarKonzept / con.fee (deep-link catalog)."""
    params: dict[str, Any] = {"limit": limit}
    if provider:
        params["provider"] = provider
    if line:
        params["line"] = line
    if search:
        params["search"] = search
    return await request("GET", "/v1/net-tariffs/products", params=params)


@mcp.tool
async def compare_net_tariff(
    gross_annual_cost: Annotated[float, "Legacy/gross annual premium EUR"],
    net_annual_cost: Annotated[float, "Nettotarif annual premium EUR"],
    advisory_fee_annual: Annotated[float, "Explicit advisory fee EUR / year"],
    provider: Annotated[NetProvider, "Partner used for fee-type metadata"] = "CONFEE",
    years: Annotated[int, "Horizon for NPV"] = 10,
) -> dict[str, Any]:
    """Gross vs net advantage with transparent advisory fee (boss-fight math)."""
    return await request(
        "POST",
        "/v1/net-tariffs/compare",
        json={
            "provider": provider,
            "grossAnnualCost": gross_annual_cost,
            "netAnnualCost": net_annual_cost,
            "advisoryFeeAnnual": advisory_fee_annual,
            "years": years,
        },
    )


@mcp.tool
async def handoff_net_tariff_application(
    provider: Annotated[NetProvider, "Partner for deep-link handoff"],
    product_id: Annotated[str, "Partner product id"],
    first_name: Annotated[str, "Applicant first name"],
    last_name: Annotated[str, "Applicant last name"],
    email: Annotated[str, "Applicant email"],
    birth_date: Annotated[str | None, "ISO birth date"] = None,
    insured_sum: Annotated[float | None, "Optional insured sum EUR"] = None,
    monthly_premium: Annotated[float | None, "Optional monthly premium"] = None,
) -> dict[str, Any]:
    """Execution-only deep-link handoff to HonorarKonzept / con.fee (no advice)."""
    applicant: dict[str, Any] = {
        "firstName": first_name,
        "lastName": last_name,
        "email": email,
    }
    if birth_date:
        applicant["birthDate"] = birth_date
    body: dict[str, Any] = {
        "provider": provider,
        "productId": product_id,
        "applicant": applicant,
    }
    if insured_sum is not None:
        body["insuredSum"] = insured_sum
    if monthly_premium is not None:
        body["monthlyPremium"] = monthly_premium
    return await request("POST", "/v1/net-tariffs/applications/handoff", json=body)


# ── Profile / vault / retrieval ──────────────────────────────────────────────


@mcp.tool
async def get_profile(
    user_id: Annotated[str | None, "User UUID"] = None,
) -> dict[str, Any]:
    """Load user profile (gross income, marital status)."""
    return await request(
        "GET",
        "/v1/profile",
        params={"userId": user_id or demo_user_id()},
    )


@mcp.tool
async def update_profile(
    user_id: Annotated[str | None, "User UUID"] = None,
    gross_monthly_income: Annotated[float | None, "EUR brutto / month"] = None,
    marital_status: Annotated[
        str | None,
        "SINGLE | MARRIED | DIVORCED | WIDOWED | REGISTERED_PARTNERSHIP",
    ] = None,
) -> dict[str, Any]:
    """Partial profile update (voice intake fields)."""
    body: dict[str, Any] = {"userId": user_id or demo_user_id()}
    if gross_monthly_income is not None:
        body["grossMonthlyIncome"] = gross_monthly_income
    if marital_status is not None:
        body["maritalStatus"] = marital_status
    return await request("PUT", "/v1/profile", json=body)


@mcp.tool
async def list_documents(
    user_id: Annotated[str | None, "User UUID"] = None,
) -> dict[str, Any]:
    """List uploaded vault documents for a user."""
    return await request(
        "GET",
        "/v1/documents",
        params={"userId": user_id or demo_user_id()},
    )


@mcp.tool
async def read_document(
    document_id: Annotated[str, "Document UUID"],
    user_id: Annotated[str | None, "User UUID"] = None,
) -> dict[str, Any]:
    """Extract text from an uploaded vault document."""
    return await request(
        "POST",
        "/v1/documents/read",
        json={"userId": user_id or demo_user_id(), "documentId": document_id},
    )


@mcp.tool
async def search_documents(
    question: Annotated[str, "Natural-language question over vault chunks"],
    user_id: Annotated[str | None, "User UUID"] = None,
) -> dict[str, Any]:
    """Semantic retrieval over uploaded policy / document vault."""
    return await request(
        "POST",
        "/v1/retrieval",
        json={"userId": user_id or demo_user_id(), "question": question},
    )


# ── Gamification ─────────────────────────────────────────────────────────────


@mcp.tool
async def gamification_profile(
    user_id: Annotated[str | None, "User UUID"] = None,
) -> dict[str, Any]:
    """XP, level, streak, badges from /api/gamification/profile."""
    return await request(
        "GET",
        "/api/gamification/profile",
        params={"userId": user_id or demo_user_id()},
    )


@mcp.tool
async def gamification_snacks() -> list[dict[str, Any]]:
    """List Just-In-Time financial snacks (quiz options without answers)."""
    return await request("GET", "/api/gamification/snacks")


@mcp.tool
async def gamification_check_in(
    user_id: Annotated[str | None, "User UUID"] = None,
) -> dict[str, Any]:
    """Sunday Money Ritual check-in via the gamification engine."""
    return await request(
        "POST",
        "/api/gamification/check-in",
        json={"userId": user_id or demo_user_id()},
    )


@mcp.tool
async def gamification_snack_answer(
    snack_slug: Annotated[str, "Snack slug"],
    option_id: Annotated[str, "Chosen option id (e.g. opt-0)"],
    user_id: Annotated[str | None, "User UUID"] = None,
) -> dict[str, Any]:
    """Submit a snack quiz answer; awards or penalizes XP."""
    return await request(
        "POST",
        "/api/gamification/snacks/answer",
        json={
            "userId": user_id or demo_user_id(),
            "snackSlug": snack_slug,
            "optionId": option_id,
        },
    )


# ── finanzmining (optional live keys) ────────────────────────────────────────


@mcp.tool
async def finanzmining_contracts(
    classes: Annotated[str | None, "Optional contract class filter"] = None,
    org_id: Annotated[str | None, "Optional org id"] = None,
    page: Annotated[int | None, "Page number"] = None,
    per_page: Annotated[int | None, "Page size"] = None,
) -> dict[str, Any]:
    """List contracts from finanzmining / cashbuzz (needs API key)."""
    params: dict[str, Any] = {}
    if classes:
        params["classes"] = classes
    if org_id:
        params["org_id"] = org_id
    if page is not None:
        params["page"] = page
    if per_page is not None:
        params["perPage"] = per_page
    return await request("GET", "/v1/finanzmining/contracts", params=params or None)


@mcp.tool
async def finanzmining_statistics() -> dict[str, Any]:
    """Analytics statistics from finanzmining / cashbuzz."""
    return await request("GET", "/v1/finanzmining/statistics")


@mcp.tool
async def finanzmining_predicted_transactions(
    min_bank_booking_date: Annotated[str | None, "ISO date lower bound"] = None,
    max_bank_booking_date: Annotated[str | None, "ISO date upper bound"] = None,
    per_page: Annotated[int | None, "Page size"] = None,
) -> dict[str, Any]:
    """Predicted transactions from finanzmining."""
    params: dict[str, Any] = {}
    if min_bank_booking_date:
        params["minBankBookingDate"] = min_bank_booking_date
    if max_bank_booking_date:
        params["maxBankBookingDate"] = max_bank_booking_date
    if per_page is not None:
        params["perPage"] = per_page
    return await request(
        "GET",
        "/v1/finanzmining/predictions/transactions",
        params=params or None,
    )


# ── Local demo math (no API) ─────────────────────────────────────────────────


@mcp.tool
def altersvorsorge_compound_shock(
    monthly_contribution: Annotated[float, "EUR / month"] = 150.0,
    years: Annotated[int, "Horizon years"] = 35,
) -> dict[str, Any]:
    """
    Altersvorsorgedepot compounding shock (monthly annuity FV).
    Legacy net 4.8% vs depot net 6.8% (7% gross − TER/drag).
    """
    def fv(pmt: float, annual: float, n: int) -> float:
        if pmt <= 0 or n <= 0:
            return 0.0
        if annual <= 0:
            return pmt * 12 * n
        r = annual / 12
        periods = 12 * n
        return pmt * (((1 + r) ** periods - 1) / r)

    legacy = fv(monthly_contribution, 0.048, years)
    depot = fv(monthly_contribution, 0.068, years)
    return {
        "monthlyContribution": monthly_contribution,
        "years": years,
        "legacyFv": round(legacy, 2),
        "depotFv": round(depot, 2),
        "delta": round(max(0.0, depot - legacy), 2),
        "legacyRate": 0.048,
        "depotRate": 0.068,
    }


# ── Resources ────────────────────────────────────────────────────────────────


@mcp.resource("fico://health")
async def resource_health() -> dict[str, Any]:
    """Live API health document."""
    return await request("GET", "/health")


@mcp.resource("fico://demo/snapshot")
async def resource_demo_snapshot() -> dict[str, Any]:
    """Seeded Lena Demo snapshot for agents."""
    return await request(
        "GET",
        "/v1/demo/snapshot",
        params={"userId": demo_user_id()},
    )


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
