# Lohono DB Context — MCP Prompts Guide

## MTD Funnel Metrics
- "Show me the MTD funnel numbers"
- "How many leads, prospects, accounts, and sales this month?"
- "What's the current month funnel performance?"
- "Month to date conversion metrics"
- "How many meetings happened this month?"
- "What are the viewings numbers for this month?"
- "What's the average lead to prospect conversion time this month?"
- "L2P, P2A, A2S duration for current month"

## Year-over-Year Comparison
- "Compare this month's funnel with last year"
- "LYTD funnel numbers"
- "Year over year sales comparison"
- "Same period last year — how were leads performing?"

## Source Breakdown
- "Breakdown of leads by source"
- "Source wise funnel for this month"
- "Which sources are performing best?"
- "Daily source breakdown of prospects and sales"

## Open/Active Pipeline
- "How many open leads do we have?"
- "What's the active pipeline count?"
- "Count of opportunities not yet closed"

## Lead Details
- "Show me a list of all leads this month"
- "Detailed lead report with agent and POC info"
- "All leads with source and enquiry date"

## Aging Reports
- "Show aging prospects — how long have they been in prospect stage?"
- "Which are the oldest accounts not yet converted?"
- "Prospect aging report sorted by days"
- "Account aging since FY 2022"

## Historical / Closed Reason Analysis
- "Why did leads close in the last 12 months?"
- "Historical funnel details with closed reasons"
- "Last 12 months lead details with stage transitions"
- "Show closed reasons by region"
- "Regional closure analysis — south vs north"

---

## Meta / Discovery Prompts (Internal LLM Tool Calls)

These are tool calls the LLM makes internally to bootstrap itself before generating SQL:

| Tool | Purpose |
|------|---------|
| `get_sales_funnel_context` | Load all business rules before generating any SQL |
| `classify_sales_intent` | Determine the right query pattern from a user question |
| `get_query_template` | Get exact rules, joins, and validation checks for a pattern |
| `list_query_patterns` | Discover all 9 available query patterns |

### Available Query Patterns

| Pattern Name | Description |
|---|---|
| `mtd_funnel_current` | Current month-to-date funnel metrics with progressive day filter |
| `mtd_funnel_last_year` | Last year same month-to-date for YoY comparison |
| `source_daily_breakdown` | Funnel metrics by source category for each day (MTD) |
| `open_funnel_count` | Count of open opportunities and enquiries |
| `mtd_lead_details` | Detailed row-level listing of all leads in current month |
| `prospect_aging` | All open prospects with days since moved to prospect stage |
| `account_aging` | All open accounts with days since moved to account stage |
| `historical_funnel_details` | Detailed records for last 12 months including closed reasons |
| `regional_closed_analysis` | Closed reasons by source region for last 12 months |

---

## Typical LLM Workflow

1. User asks: *"How are leads performing by source this month?"*
2. LLM calls `classify_sales_intent({ question: "..." })` → gets `source_daily_breakdown` pattern
3. LLM calls `get_query_template({ pattern_name: "source_daily_breakdown" })` → gets all rules (slug exclusions, DnB exclusion for leads only, source CASE statement, no progressive day filter, etc.)
4. LLM builds SQL using the rules and calls `query({ sql: "..." })`
5. LLM formats and returns results to the user
