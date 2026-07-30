interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * UK NIHR (National Institute for Health and Care Research) open-data MCP.
 *
 * Every research and training award NIHR has made — 11,502 awards worth ~£7.4bn —
 * from nihr.opendatasoft.com (Opendatasoft Explore v2.1 API, keyless). Award value
 * is a real number (`award_amount_from_dh`, GBP), so amounts can be filtered, sorted
 * and summed. Covers who was funded, which programme, how much, where, and which
 * health category. NIHR is the UK's health-research funder specifically; UKRI covers
 * the rest of UK public research funding.
 */


const HOST = 'https://nihr.opendatasoft.com/api/explore/v2.1/catalog/datasets';
const UA = 'pipeworx-mcp-nihr/1.0 (+https://pipeworx.io)';

/** NIHR Research and Training Awards Dataset — 11,502 awards, one row per award. */
const AWARDS = 'nihr-summary-view';
/** NIHR Award Holders Dataset — 12,644 rows, one per person-on-award. */
const HOLDERS = 'award-holders-table';

/** Opendatasoft rejects limit > 100 outright (InvalidRESTParameterError). */
const MAX_LIMIT = 100;

/** Compact award fields returned by list-style tools. */
const AWARD_LIST_SELECT =
  'project_id, project_title, programme, funding_stream, project_status, contracted_organisation, ' +
  'organisation_type, award_amount_from_dh, start_date, end_date, award_holder_name, funding_and_awards_link';

const GROUPABLE = ['programme', 'funding_stream', 'programme_type', 'programme_stream'] as const;
type GroupField = (typeof GROUPABLE)[number];

const tools: McpToolExport['tools'] = [
  {
    name: 'nihr_search_awards',
    description:
      'Search UK NIHR (National Institute for Health and Care Research) health research grants by keyword over award titles and abstracts. Returns each award\'s project id, title, NIHR programme and funding stream, contracted organisation, award value in GBP, start and end dates, chief investigator name, and the fundingawards.nihr.ac.uk link. Filter by programme name, project status (Active, Complete, Contracted, Discontinued) and a minimum award amount; sort by award value or start date. Answers questions like "which NIHR grants fund diabetes research", "the largest active NIHR cancer awards", or "recent NIHR mental-health funding".',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Free-text keyword or phrase, e.g. "diabetes", "antimicrobial resistance", "dementia care". Matched against award titles and, unless title_only is set, the plain-English and scientific abstracts.',
        },
        title_only: {
          type: 'boolean',
          description: 'Restrict the keyword match to the award title for a tighter, more on-topic result set (default false, which also searches both abstracts).',
        },
        programme: {
          type: 'string',
          description: 'NIHR programme name, matched as a case-insensitive substring, e.g. "Health Technology Assessment", "Public Health", "Fellowships". Call nihr_awards_by_programme with no arguments to list the real programme names.',
        },
        funding_stream: {
          type: 'string',
          description: 'NIHR funding stream, matched as a case-insensitive substring, e.g. "Doctoral Fellowship", "Commissioned", "Researcher-led".',
        },
        project_status: {
          type: 'string',
          description: 'Exact award status: Active, Complete, Contracted or Discontinued.',
        },
        organisation: {
          type: 'string',
          description: 'Contracted organisation, matched as a case-insensitive substring, e.g. "Oxford", "Guy\'s and St Thomas".',
        },
        min_amount: {
          type: 'number',
          description: 'Only awards worth at least this many GBP (award_amount_from_dh), e.g. 1000000 for awards of £1m and up.',
        },
        max_amount: { type: 'number', description: 'Only awards worth at most this many GBP.' },
        start_from: { type: 'string', description: 'Only awards starting on or after this date, YYYY-MM-DD.' },
        start_to: { type: 'string', description: 'Only awards starting on or before this date, YYYY-MM-DD.' },
        sort_by: {
          type: 'string',
          enum: ['amount_desc', 'amount_asc', 'start_date_desc', 'start_date_asc'],
          description: 'Ordering of results (default amount_desc, biggest award first).',
        },
        limit: { type: 'number', description: `Max awards to return, 1-${MAX_LIMIT} (default 20).` },
        offset: { type: 'number', description: 'Pagination offset (default 0).' },
      },
    },
  },
  {
    name: 'nihr_get_award',
    description:
      'Retrieve one UK NIHR award in full by its project id (either the modern form NIHR208893 or the older slash form 002/0028). Returns the plain-English abstract and the scientific abstract, award value in GBP, programme, funding stream and status, start and end dates, the contracted organisation with postcode and latitude/longitude, HRCS and UKCRC health-category coding, the fundingawards.nihr.ac.uk record link, and every named award holder with their ORCID and role. Use when an agent has an NIHR project reference and needs the detail behind it.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: {
          type: 'string',
          description: 'NIHR project id exactly as published, e.g. "NIHR208893", "002/0028" or "DRF-2009-02-122". Slashes are handled.',
        },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'nihr_awards_by_organisation',
    description:
      'Total up UK NIHR health research funding held by a university, NHS trust or company. Give any part of the institution name and get back the number of NIHR awards, the summed award value in GBP, the distinct organisation-name variants that matched, a breakdown by programme, and the individual awards with their values and dates. Answers "how much NIHR money does Imperial College hold", "how many NIHR awards has Guy\'s and St Thomas won", and institutional league-table comparisons.',
    inputSchema: {
      type: 'object',
      properties: {
        organisation: {
          type: 'string',
          description: 'Institution name or fragment, matched as a case-insensitive substring of contracted_organisation, e.g. "Imperial", "University of Leeds", "Manchester University NHS Foundation Trust".',
        },
        project_status: { type: 'string', description: 'Restrict to one status: Active, Complete, Contracted or Discontinued.' },
        min_amount: { type: 'number', description: 'Only count and list awards worth at least this many GBP.' },
        start_from: { type: 'string', description: 'Only awards starting on or after this date, YYYY-MM-DD — useful for "funding won since 2020".' },
        limit: { type: 'number', description: `Max individual awards to list, 1-${MAX_LIMIT} (default 20). The totals always cover every match, not just the listed page.` },
        offset: { type: 'number', description: 'Pagination offset for the listed awards (default 0).' },
      },
      required: ['organisation'],
    },
  },
  {
    name: 'nihr_award_holders',
    description:
      'Find the researchers named on UK NIHR awards by personal name or ORCID identifier. Returns each matching award holder with their ORCID, their role on the award (Chief Investigator, Joint Lead Applicant or Award Holder) and the NIHR project ids they hold, so an agent can pivot straight into nihr_get_award for the grant detail. Answers "which NIHR grants does Professor X hold", "who is the chief investigator on this NIHR award", and ORCID-to-grant lookups across 12,644 award-holder records.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Researcher name or any part of it, e.g. "Hajat", "Emma Bland". Titles such as Professor and Dr are part of the stored name and may be included or omitted.',
        },
        orcid: { type: 'string', description: 'ORCID identifier in full, e.g. "0000-0002-3086-362X".' },
        project_id: { type: 'string', description: 'NIHR project id, e.g. "NIHR208893" or "002/0028", to list everyone named on that one award.' },
        involvement_type: {
          type: 'string',
          description: 'Restrict to one role: "Chief Investigator", "Joint Lead Applicant" or "Award Holder".',
        },
        limit: { type: 'number', description: `Max award holders to return, 1-${MAX_LIMIT} (default 20).` },
        offset: { type: 'number', description: 'Pagination offset (default 0).' },
      },
    },
  },
  {
    name: 'nihr_awards_by_programme',
    description:
      'Break UK NIHR funding down by programme or funding stream: award counts, total value in GBP, mean award size and the date range of awards in each. Called with no arguments it lists every NIHR programme that actually exists with its totals, which is the way to discover valid programme names before filtering elsewhere. Answers "which NIHR programme spends the most", "how many awards has the Health Technology Assessment programme made", and "what NIHR fellowship schemes exist and how big are they".',
    inputSchema: {
      type: 'object',
      properties: {
        group_by: {
          type: 'string',
          enum: ['programme', 'funding_stream', 'programme_type', 'programme_stream'],
          description: 'Field to aggregate on (default "programme"). "funding_stream" is the finer-grained scheme name; "programme_type" splits Research from Career Development.',
        },
        filter: {
          type: 'string',
          description: 'Only include groups whose name contains this case-insensitive substring, e.g. "Fellowship", "Public Health", "Global".',
        },
        project_status: { type: 'string', description: 'Restrict the aggregation to one status: Active, Complete, Contracted or Discontinued.' },
        start_from: { type: 'string', description: 'Only aggregate awards starting on or after this date, YYYY-MM-DD.' },
        sort_by: {
          type: 'string',
          enum: ['total_desc', 'count_desc', 'name_asc'],
          description: 'Ordering of the groups (default total_desc, biggest spend first).',
        },
        limit: { type: 'number', description: `Max groups to return, 1-${MAX_LIMIT} (default 30).` },
      },
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'nihr_search_awards':
      return searchAwards(args);
    case 'nihr_get_award':
      return getAward(args);
    case 'nihr_awards_by_organisation':
      return awardsByOrganisation(args);
    case 'nihr_award_holders':
      return awardHolders(args);
    case 'nihr_awards_by_programme':
      return awardsByProgramme(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/* ------------------------------------------------------------------ tools */

async function searchAwards(args: Record<string, unknown>): Promise<unknown> {
  const conds: string[] = [];

  const query = strArg(args.query);
  if (query) {
    conds.push(
      args.title_only === true
        ? searchClause('project_title', query)
        : `(${[
            searchClause('project_title', query),
            searchClause('plain_english_abstract', query),
            searchClause('scientific_abstract', query),
          ].join(' or ')})`,
    );
  }

  const filters = commonFilters(args);
  conds.push(...filters.conds);

  if (!conds.length) {
    return {
      found: false,
      reason: 'no_criteria',
      hint: 'Supply at least one of query, programme, funding_stream, project_status, organisation, min_amount or start_from. Call nihr_awards_by_programme with no arguments to see the programme names available.',
    };
  }

  const sort = sortClause(strArg(args.sort_by), {
    amount_desc: 'award_amount_from_dh desc',
    amount_asc: 'award_amount_from_dh asc',
    start_date_desc: 'start_date desc',
    start_date_asc: 'start_date asc',
  }, 'award_amount_from_dh desc');

  const limit = clamp(numArg(args.limit, 20), 1, MAX_LIMIT);
  const offset = Math.max(0, numArg(args.offset, 0));
  const where = conds.join(' and ');

  const data = await ods(AWARDS, { where, select: AWARD_LIST_SELECT, order_by: sort, limit, offset });
  const rows = (data.results ?? []) as AwardRow[];

  if (!rows.length) {
    return {
      found: false,
      reason: 'no_matching_awards',
      hint: `No NIHR awards matched. Try a broader keyword, drop min_amount/project_status, or use nihr_awards_by_programme to check the exact programme name. Filters applied: ${describe(args)}.`,
      source: 'NIHR Open Data',
    };
  }

  return {
    found: true,
    source: 'NIHR Open Data (nihr.opendatasoft.com)',
    dataset: AWARDS,
    query: query || null,
    filters_applied: filters.described,
    sorted_by: sort,
    total_matching: data.total_count ?? rows.length,
    count: rows.length,
    offset,
    currency: 'GBP',
    awards: rows.map(compactAward),
  };
}

async function getAward(args: Record<string, unknown>): Promise<unknown> {
  const projectId = strArg(args.project_id);
  if (!projectId) {
    return { found: false, reason: 'missing_project_id', hint: 'Pass project_id, e.g. "NIHR208893" or "002/0028". Use nihr_search_awards to find one by keyword.' };
  }

  // project_id values contain slashes ("002/0028"); the double-quoted literal plus
  // URLSearchParams encoding round-trips them correctly.
  const data = await ods(AWARDS, { where: `project_id=${lit(projectId)}`, limit: 1 });
  const row = (data.results ?? [])[0] as AwardRow | undefined;

  if (!row) {
    return {
      found: false,
      reason: 'award_not_found',
      hint: `No NIHR award has project_id "${projectId}". Ids look like "NIHR208893", "002/0028" or "DRF-2009-02-122" — copy it exactly, including any slashes. Search by title with nihr_search_awards instead.`,
      source: 'NIHR Open Data',
    };
  }

  const holders = await ods(HOLDERS, {
    where: `project_id=${lit(projectId)}`,
    select: 'award_holder_name, orcid, involvement_type',
    limit: MAX_LIMIT,
  }).catch(() => ({ results: [] as unknown[] }));

  return {
    found: true,
    source: 'NIHR Open Data (nihr.opendatasoft.com)',
    dataset: AWARDS,
    currency: 'GBP',
    award: {
      project_id: row.project_id,
      project_title: row.project_title,
      acronym: row.acronym || null,
      funding_and_awards_link: row.funding_and_awards_link || null,
      funder: row.funder || null,
      project_status: row.project_status || null,
      programme: row.programme || null,
      programme_type: row.programme_type || null,
      programme_stream: row.programme_stream || null,
      funding_stream: row.funding_stream || null,
      award_amount_gbp: money(row.award_amount_from_dh),
      award_amount_millions_gbp: row.award_amount_m ?? null,
      start_date: row.start_date || null,
      end_date: row.end_date || null,
      plain_english_abstract: row.plain_english_abstract || null,
      scientific_abstract: row.scientific_abstract || null,
      health_categorisation: {
        ukcrc_health_categories: asArray(row.ukcrc_value),
        hrcs_research_activity: row.hrcs_rac_category || null,
        ukcrc_research_activity: row.ukcrc_value_rac || null,
        curated_portfolios: asArray(row.categorytype),
      },
      organisation: {
        contracted_organisation: row.contracted_organisation || null,
        organisation_type: row.organisation_type || null,
        postcode: row.postcode || null,
        latitude: row.latitude ?? null,
        longitude: row.longitude ?? null,
      },
      oda_partner_countries: asArray(row.institutioncountry),
      lead_award_holder: row.award_holder_name || null,
      award_holders: ((holders.results ?? []) as HolderRow[]).map((h) => ({
        name: h.award_holder_name || null,
        orcid: h.orcid || null,
        involvement_type: h.involvement_type || null,
      })),
    },
  };
}

async function awardsByOrganisation(args: Record<string, unknown>): Promise<unknown> {
  const org = strArg(args.organisation);
  if (!org) {
    return { found: false, reason: 'missing_organisation', hint: 'Pass organisation, e.g. "Imperial", "University of Leeds" or "Guy\'s and St Thomas". Any part of the institution name works.' };
  }

  const conds = [`contracted_organisation like ${lit(org)}`];
  const status = strArg(args.project_status);
  if (status) conds.push(`project_status=${lit(status)}`);
  const minAmount = optNum(args.min_amount);
  if (minAmount !== undefined) conds.push(`award_amount_from_dh >= ${minAmount}`);
  const startFrom = dateArg(args.start_from);
  if (startFrom) conds.push(`start_date >= date'${startFrom}'`);
  const where = conds.join(' and ');

  const limit = clamp(numArg(args.limit, 20), 1, MAX_LIMIT);
  const offset = Math.max(0, numArg(args.offset, 0));

  const [totals, variants, byProgramme, awards] = await Promise.all([
    // Aggregate with no group_by: Opendatasoft echoes the same totals row per record,
    // so read results[0] only.
    ods(AWARDS, { where, select: 'count(*) as awards, sum(award_amount_from_dh) as total, avg(award_amount_from_dh) as mean, min(start_date) as first_start, max(start_date) as last_start' }),
    ods(AWARDS, { where, group_by: 'contracted_organisation', select: 'contracted_organisation, count(*) as awards, sum(award_amount_from_dh) as total', order_by: 'total desc', limit: MAX_LIMIT }),
    ods(AWARDS, { where, group_by: 'programme', select: 'programme, count(*) as awards, sum(award_amount_from_dh) as total', order_by: 'total desc', limit: 25 }),
    ods(AWARDS, { where, select: AWARD_LIST_SELECT, order_by: 'award_amount_from_dh desc', limit, offset }),
  ]);

  const agg = ((totals.results ?? [])[0] ?? {}) as AggRow;
  const rows = (awards.results ?? []) as AwardRow[];

  if (!rows.length) {
    return {
      found: false,
      reason: 'no_awards_for_organisation',
      hint: `No NIHR awards matched an organisation containing "${org}". Institution names are stored as contracted on the award, so try a shorter fragment ("Imperial" rather than "Imperial College London, Faculty of Medicine") or check the spelling.`,
      source: 'NIHR Open Data',
    };
  }

  return {
    found: true,
    source: 'NIHR Open Data (nihr.opendatasoft.com)',
    dataset: AWARDS,
    organisation_query: org,
    currency: 'GBP',
    total_awards: agg.awards ?? rows.length,
    total_funded_gbp: money(agg.total),
    mean_award_gbp: money(agg.mean),
    earliest_start: isoDate(agg.first_start),
    latest_start: isoDate(agg.last_start),
    matched_organisation_names: ((variants.results ?? []) as GroupRow[]).map((g) => ({
      contracted_organisation: g.contracted_organisation ?? null,
      awards: g.awards ?? null,
      total_funded_gbp: money(g.total),
    })),
    by_programme: ((byProgramme.results ?? []) as GroupRow[]).map((g) => ({
      programme: g.programme ?? null,
      awards: g.awards ?? null,
      total_funded_gbp: money(g.total),
    })),
    count: rows.length,
    offset,
    awards: rows.map(compactAward),
  };
}

async function awardHolders(args: Record<string, unknown>): Promise<unknown> {
  const conds: string[] = [];
  const name = strArg(args.name);
  const orcid = strArg(args.orcid);
  const projectId = strArg(args.project_id);
  const involvement = strArg(args.involvement_type);

  if (name) conds.push(searchClause('award_holder_name', name));
  if (orcid) conds.push(`orcid=${lit(orcid)}`);
  if (projectId) conds.push(`project_id=${lit(projectId)}`);
  if (involvement) conds.push(`involvement_type=${lit(involvement)}`);

  if (!conds.length) {
    return {
      found: false,
      reason: 'no_criteria',
      hint: 'Pass at least one of name (e.g. "Hajat"), orcid (e.g. "0000-0002-3086-362X") or project_id (e.g. "NIHR208893").',
    };
  }

  const limit = clamp(numArg(args.limit, 20), 1, MAX_LIMIT);
  const offset = Math.max(0, numArg(args.offset, 0));

  const data = await ods(HOLDERS, {
    where: conds.join(' and '),
    select: 'project_id, award_holder_name, orcid, involvement_type',
    order_by: 'award_holder_name',
    limit,
    offset,
  });
  const rows = (data.results ?? []) as HolderRow[];

  if (!rows.length) {
    return {
      found: false,
      reason: 'no_matching_award_holders',
      hint: `Nobody in the NIHR award-holders dataset matched. Names are stored with titles ("Professor Shakoor Hajat") — try the surname alone. ORCIDs must be the full 0000-0000-0000-0000 form. Only named investigators on NIHR awards appear here.`,
      source: 'NIHR Open Data',
    };
  }

  return {
    found: true,
    source: 'NIHR Open Data (nihr.opendatasoft.com)',
    dataset: HOLDERS,
    total_matching: data.total_count ?? rows.length,
    count: rows.length,
    offset,
    next_step: 'Call nihr_get_award with any project_id below for the full award record.',
    award_holders: rows.map((h) => ({
      award_holder_name: h.award_holder_name || null,
      orcid: h.orcid || null,
      involvement_type: h.involvement_type || null,
      project_id: h.project_id || null,
      funding_and_awards_link: h.project_id ? `https://fundingawards.nihr.ac.uk/award/${h.project_id}` : null,
    })),
  };
}

async function awardsByProgramme(args: Record<string, unknown>): Promise<unknown> {
  const field: GroupField = (GROUPABLE as readonly string[]).includes(strArg(args.group_by))
    ? (strArg(args.group_by) as GroupField)
    : 'programme';

  const conds: string[] = [];
  const filter = strArg(args.filter);
  if (filter) conds.push(`${field} like ${lit(filter)}`);
  const status = strArg(args.project_status);
  if (status) conds.push(`project_status=${lit(status)}`);
  const startFrom = dateArg(args.start_from);
  if (startFrom) conds.push(`start_date >= date'${startFrom}'`);

  const sort = sortClause(strArg(args.sort_by), {
    total_desc: 'total desc',
    count_desc: 'awards desc',
    name_asc: `${field} asc`,
  }, 'total desc');

  const limit = clamp(numArg(args.limit, 30), 1, MAX_LIMIT);

  const data = await ods(AWARDS, {
    where: conds.length ? conds.join(' and ') : undefined,
    group_by: field,
    select: `${field}, count(*) as awards, sum(award_amount_from_dh) as total, avg(award_amount_from_dh) as mean, min(start_date) as first_start, max(start_date) as last_start`,
    order_by: sort,
    limit,
  });
  const rows = (data.results ?? []) as GroupRow[];

  if (!rows.length) {
    return {
      found: false,
      reason: 'no_matching_groups',
      hint: `No NIHR ${field} values matched${filter ? ` the filter "${filter}"` : ''}. Call this tool with no arguments to list every ${field} that exists.`,
      source: 'NIHR Open Data',
    };
  }

  const groups = rows.map((g) => ({
    [field]: (g as Record<string, unknown>)[field] ?? null,
    awards: g.awards ?? null,
    total_value_gbp: money(g.total),
    mean_award_gbp: money(g.mean),
    first_start: isoDate(g.first_start),
    last_start: isoDate(g.last_start),
  }));

  return {
    found: true,
    source: 'NIHR Open Data (nihr.opendatasoft.com)',
    dataset: AWARDS,
    grouped_by: field,
    filter: filter || null,
    project_status: status || null,
    sorted_by: sort,
    currency: 'GBP',
    // total_count from a group_by query is the number of groups returned, capped by limit.
    group_count: rows.length,
    groups_total_value_gbp: money(rows.reduce((s, g) => s + (typeof g.total === 'number' ? g.total : 0), 0)),
    groups_total_awards: rows.reduce((s, g) => s + (typeof g.awards === 'number' ? g.awards : 0), 0),
    groups,
  };
}

/* ------------------------------------------------------------- ODS client */

interface OdsResponse {
  total_count?: number;
  results?: unknown[];
}

async function ods(dataset: string, params: Record<string, unknown>): Promise<OdsResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    qs.set(k, String(v));
  }
  const url = `${HOST}/${dataset}/records?${qs.toString()}`;
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  const body = await res.text();

  if (!res.ok) {
    let detail = body.slice(0, 220);
    try {
      const err = JSON.parse(body) as { error_code?: string; message?: string };
      if (err.message) detail = `${err.error_code ? `${err.error_code}: ` : ''}${err.message}`;
    } catch {
      /* non-JSON error body — use the raw prefix */
    }
    throw new Error(`NIHR Open Data (${dataset}): HTTP ${res.status} — ${detail}`);
  }

  try {
    return JSON.parse(body) as OdsResponse;
  } catch {
    throw new Error(`NIHR Open Data (${dataset}): unparseable response — ${body.slice(0, 160)}`);
  }
}

/* --------------------------------------------------------------- ODSQL bits */

/** Double-quoted ODSQL string literal. Slashes are fine; embedded quotes are dropped. */
function lit(v: string): string {
  return `"${v.replace(/["\\]/g, '').trim()}"`;
}

/** Opendatasoft function-form full-text match inside one field. */
function searchClause(field: string, text: string): string {
  return `search(${field}, ${lit(text)})`;
}

function commonFilters(args: Record<string, unknown>): { conds: string[]; described: Record<string, unknown> } {
  const conds: string[] = [];
  const described: Record<string, unknown> = {};

  const programme = strArg(args.programme);
  if (programme) {
    conds.push(`programme like ${lit(programme)}`);
    described.programme = programme;
  }
  const stream = strArg(args.funding_stream);
  if (stream) {
    conds.push(`funding_stream like ${lit(stream)}`);
    described.funding_stream = stream;
  }
  const status = strArg(args.project_status);
  if (status) {
    conds.push(`project_status=${lit(status)}`);
    described.project_status = status;
  }
  const org = strArg(args.organisation);
  if (org) {
    conds.push(`contracted_organisation like ${lit(org)}`);
    described.organisation = org;
  }
  const min = optNum(args.min_amount);
  if (min !== undefined) {
    conds.push(`award_amount_from_dh >= ${min}`);
    described.min_amount_gbp = min;
  }
  const max = optNum(args.max_amount);
  if (max !== undefined) {
    conds.push(`award_amount_from_dh <= ${max}`);
    described.max_amount_gbp = max;
  }
  const from = dateArg(args.start_from);
  if (from) {
    conds.push(`start_date >= date'${from}'`);
    described.start_from = from;
  }
  const to = dateArg(args.start_to);
  if (to) {
    conds.push(`start_date <= date'${to}'`);
    described.start_to = to;
  }
  return { conds, described };
}

function sortClause(requested: string, map: Record<string, string>, fallback: string): string {
  return map[requested] ?? fallback;
}

/* ------------------------------------------------------------------- shapes */

interface AwardRow {
  project_id?: string;
  project_title?: string;
  acronym?: string | null;
  funding_and_awards_link?: string;
  funder?: string;
  project_status?: string;
  programme?: string;
  programme_type?: string | null;
  programme_stream?: string | null;
  funding_stream?: string;
  award_amount_from_dh?: number | null;
  award_amount_m?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  plain_english_abstract?: string | null;
  scientific_abstract?: string | null;
  organisation_type?: string | null;
  contracted_organisation?: string | null;
  postcode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  award_holder_name?: string | null;
  orcid?: string | null;
  ukcrc_value?: string[] | string | null;
  hrcs_rac_category?: string | null;
  ukcrc_value_rac?: string | null;
  categorytype?: string[] | string | null;
  institutioncountry?: string[] | string | null;
}

interface HolderRow {
  project_id?: string;
  orcid?: string | null;
  award_holder_name?: string | null;
  involvement_type?: string | null;
}

interface AggRow {
  awards?: number;
  total?: number | null;
  mean?: number | null;
  first_start?: string | null;
  last_start?: string | null;
}

interface GroupRow extends AggRow {
  programme?: string | null;
  funding_stream?: string | null;
  programme_type?: string | null;
  programme_stream?: string | null;
  contracted_organisation?: string | null;
}

function compactAward(r: AwardRow): Record<string, unknown> {
  return {
    project_id: r.project_id,
    project_title: r.project_title,
    programme: r.programme || null,
    funding_stream: r.funding_stream || null,
    project_status: r.project_status || null,
    contracted_organisation: r.contracted_organisation || null,
    organisation_type: r.organisation_type || null,
    award_amount_gbp: money(r.award_amount_from_dh),
    start_date: r.start_date || null,
    end_date: r.end_date || null,
    award_holder_name: r.award_holder_name || null,
    funding_and_awards_link: r.funding_and_awards_link || null,
  };
}

/* -------------------------------------------------------------- primitives */

function strArg(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}
function numArg(v: unknown, dflt: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : dflt;
}
function optNum(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}
function dateArg(v: unknown): string {
  if (typeof v !== 'string') return '';
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}
function money(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}
/** Aggregate min/max over a date field come back as full ISO timestamps. */
function isoDate(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : v;
}
function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return typeof v === 'string' && v ? [v] : [];
}
function describe(args: Record<string, unknown>): string {
  const parts = Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${String(v)}`);
  return parts.length ? parts.join(', ') : 'none';
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
