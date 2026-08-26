# @pipeworx/nihr

UK NIHR MCP — every research and training award made by the National Institute for Health and Care Research: who was funded, which programme, how much, where, and which health category. Keyless.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1476+ live data sources.

## Tools

- `nihr_search_awards(...)` — keyword search over award titles and abstracts, with filters on programme, funding stream, status, organisation, award amount and start date. Sortable by value or start date.
- `nihr_get_award(project_id)` — one award in full: both abstracts, value, dates, HRCS/UKCRC health coding, organisation with postcode and lat/lon, funding-and-awards link, and every named award holder with ORCID and role.
- `nihr_awards_by_organisation(organisation, ...)` — all NIHR awards to an institution (forgiving substring match), with total funded GBP, mean award, the organisation-name variants that matched, and a per-programme breakdown.
- `nihr_award_holders(...)` — chief investigators and co-applicants by name, ORCID or project id, returning their project ids to pivot into `nihr_get_award`.
- `nihr_awards_by_programme(...)` — award counts, total value, mean size and date range grouped by programme, funding stream, programme type or programme stream. Call with no arguments to discover the real programme names.

## Auth

None. The NIHR Opendatasoft portal is fully open — no key, no signup, no per-key quota.

## Data sources

- Portal: https://nihr.opendatasoft.com/
- Dataset catalogue: `https://nihr.opendatasoft.com/api/explore/v2.1/catalog/datasets?limit=40` (26 datasets)
- Awards (primary, 11,502 rows): `https://nihr.opendatasoft.com/api/explore/v2.1/catalog/datasets/nihr-summary-view/records`
- Award holders (12,644 rows): `https://nihr.opendatasoft.com/api/explore/v2.1/catalog/datasets/award-holders-table/records`
- Public record per award: `https://fundingawards.nihr.ac.uk/award/<project_id>`

Other datasets on the same portal, not yet wired into this pack: `nihr-infrastructure-supported-projects` (45,258), `infonihr-award-hrcs-rac-coding-and-apportionment` (14,301), `infonihr-award-hrcs-coding-and-apportionment` (13,771), `iat-data` (6,275 integrated academic training), `coded-portfolio` (1,964), `phof-datase` (1,585 public health), `nihr-open-data-global-health-downstream-partner-data` (1,528), `schools-data` (1,022), `rare-diseases-research-landscape-project` (787), `womens-health-curated-portfolio` (691), `prp_dataset` (509).

### Gotchas

`project_id` values come in three shapes and one of them contains slashes — `002/0028` alongside `NIHR208893` and `DRF-2009-02-122` — so the id must sit inside a double-quoted ODSQL literal and the whole `where` clause must be URL-encoded (`where=project_id%3d%22002%2f0028%22`); an unquoted or unencoded id silently matches nothing. `limit` hard-caps at 100 and Opendatasoft returns `InvalidRESTParameterError` rather than clamping, so the pack clamps for you. Full-text matching inside a field needs the ODS function form `search(field, "text")`; plain `field="value"` is exact equality, and `field like "value"` is the case-insensitive substring match this pack uses for institution and programme names — necessary because the same institution appears under several contracted names (`Imperial College London`, `Imperial College of Science, Technology and Medicine` and `IMPERIAL COLLEGE HEALTHCARE NHS TRUST` are three separate values covering 419 awards between them). `award_amount_from_dh` is a genuine number in GBP, so it can be filtered, sorted and summed — but an aggregate `select` with no `group_by` echoes the same totals row once per matched record, so read only the first result. `min()`/`max()` over a date field return full ISO timestamps rather than dates. On a `group_by` query `total_count` is the number of *groups* and is capped by `limit`, so it is not a row count. Some awards have a null `programme_type` (1,055 of them), and `award_holder_name` on the awards dataset can pack two people into one string separated by `/` — the award-holders dataset is the reliable per-person view.

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "nihr": {
      "url": "https://gateway.pipeworx.io/nihr/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/nihr/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1476+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Nihr data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
