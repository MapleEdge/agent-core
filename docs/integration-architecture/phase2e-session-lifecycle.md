# Phase 2E: Session Lifecycle Management

Full session CRUD (list, close, delete) modeled after Parlant's `SessionStore` and cognee's session router.

## Vendor Source Inspected

### Parlant `SessionStore` — abstract session contract

**File:** `vendor/providers/policy/parlant/src/parlant/core/sessions.py:292-380`

| Method | Lines | Signature | Logic |
|--------|-------|-----------|-------|
| `create_session()` | 294-303 | `(customer_id, agent_id, creation_utc?, title?, mode?, metadata?, labels?) -> Session` | Creates session with customer+agent binding, optional metadata dict and label set. |
| `read_session()` | 305-309 | `(session_id) -> Session` | Reads by ID. Raises `ItemNotFoundError` on miss. |
| `delete_session()` | 311-315 | `(session_id) -> None` | Deletes session and associated events. |
| `update_session()` | 317-322 | `(session_id, params: SessionUpdateParams) -> Session` | Generic update with a params dict. Used for title changes, mode changes, etc. |
| `list_sessions()` | 324-333 | `(agent_id?, customer_id?, limit?, cursor?, sort_direction?, labels?) -> SessionListing` | Paginated listing with cursor support, agent/customer filters, label filtering, sort direction. |
| `set_metadata()` | 335-339 | `(session_id, key, value) -> None` | Sets a single metadata key-value pair. |
| `delete_metadata()` | 341-345 | `(session_id, key) -> None` | Removes a single metadata key. |

### Parlant `SessionStore` implementation (SQLite-backed)

**File:** `vendor/providers/policy/parlant/src/parlant/core/sessions.py:1080-1210`

| Method | Lines | Key implementation details |
|--------|-------|---------------------------|
| `create_session()` | 1082-1112 | Uses `async with self._lock.writer_lock` for concurrency. Generates ID via `generate_id()`. Initializes `consumption_offsets: {"client": 0}`. Inserts via `_session_collection.insert_one()`. |
| `delete_session()` | 1115-1128 | Writer lock. First deletes all events matching `session_id` via `safe_gather()` (parallel async deletion), then deletes the session itself. |
| `read_session()` | 1131-1143 | Reader lock. `find_one({"id": {"$eq": session_id}})`. Raises `ItemNotFoundError` on miss. |
| `update_session()` | 1146-1166 | Writer lock. Finds session, updates via `update_one()` with serialized params. Asserts `result.updated_document` exists. |
| `list_sessions()` | 1169-1208 | Reader lock. Builds filter dict from `agent_id`, `customer_id`. Passes `limit`, `cursor`, `sort_direction` to `find()`. Post-filters by labels using `issubset()`. Returns `SessionListing(items, total_count, cursor)`. |

**Key design:**
- Reader/writer lock for concurrency
- MongoDB-style query operators (`$eq`)
- Cursor-based pagination (vs offset-based)
- Label filtering is post-query (not in the DB query)
- `consumption_offsets` for tracking which events have been consumed by which consumers
- `agent_states` array for multi-agent sessions

### cognee `get_sessions_router()` — dashboard session API

**File:** `vendor/providers/knowledge/cognee/cognee/api/v1/sessions/routers/get_sessions_router.py:80-130`

| Endpoint | Lines | Logic |
|----------|-------|-------|
| `GET /sessions` (list) | 83-130 | Parameters: `range` (24h/7d/30d/all), `status`, `limit`, `offset`, `order_by`, `descending`. Fetches `_permitted_dataset_ids_for(user)` and `_visible_user_ids(user)` (includes child agent IDs). Calls `list_session_rows()` with all filters. Returns `{sessions, total, limit, offset, has_more}` envelope. |
| `_range_since(range_key)` | 39-47 | Converts range literal to datetime: 24h→1day, 7d→7days, 30d→30days, all→None. |
| `_permitted_dataset_ids_for(user)` | 50-58 | Returns dataset UUIDs the user can read. Catches `PermissionDeniedError`. |
| `_child_agent_user_ids(user_id)` | 61-70 | SQLAlchemy query for users with `parent_user_id == user_id`. |
| `_visible_user_ids(user)` | 73-77 | User's own ID + child agent IDs. |
| `GET /sessions/stats` | 132+ | Aggregate dashboard stats (session counts by status, costs). |
| `GET /sessions/{session_id}` | (later in file) | Detail view with model usage breakdown. |

**Key design:**
- Time-range filtering (24h/7d/30d/all) — dashboard-oriented
- Multi-user visibility (parent can see child agent sessions)
- Offset-based pagination with `has_more` flag
- `effective_status` computed in SQL (abandonment-by-idle rule)
- Per-model cost tracking (token counts × pricing)

## agent-core Session Lifecycle

### `SessionProvider` interface changes

**File:** `src/providers/SessionProvider.ts:35-58`

| Method | Signature | Parlant equivalent | cognee equivalent |
|--------|-----------|-------------------|-------------------|
| `create(repo_id?)` | `-> SessionRecord` | `create_session(customer_id, agent_id, ...)` | N/A (sessions created implicitly) |
| `get(id)` | `-> SessionRecord \| null` | `read_session(session_id)` (raises on miss) | `GET /sessions/{id}` |
| **`list(opts?)`** (NEW) | `-> SessionRecord[]` | `list_sessions(agent_id?, customer_id?, limit?, cursor?, ...)` | `GET /sessions` with range/status/limit/offset |
| **`close(id, summary?)`** (NEW) | `-> SessionRecord \| null` | `update_session(session_id, {status: ...})` | N/A |
| **`delete(id)`** (NEW) | `-> boolean` | `delete_session(session_id)` | N/A |
| `addEvent(...)` | `-> SessionEvent` | (separate EventStore) | N/A |
| `getTimeline(...)` | `-> TimelineItem[]` | (separate) | N/A |
| `updateSummary(...)` | `-> SessionRecord \| null` | `update_session(session_id, {title: ...})` | N/A |

### `MockSessionProvider` new methods

**File:** `src/providers/mocks/MockSessionProvider.ts`

| Method | Lines | SQL | Parlant comparison |
|--------|-------|-----|-------------------|
| `list(opts?)` | 56-73 | `SELECT * FROM sessions [WHERE status=? AND repo_id=?] ORDER BY created_at DESC LIMIT ?` | Parlant: `_session_collection.find(filters, limit, cursor, sort_direction)` with reader lock. Ours: direct SQL with dynamic WHERE clause. |
| `close(id, summary?)` | 76-88 | `UPDATE sessions SET status='closed' [, summary=?], updated_at=datetime('now') WHERE id=?` | Parlant: `update_session(id, SessionUpdateParams)` — generic update. Ours: explicit `close()` method for clarity. |
| `delete(id)` | 90-96 | Deletes `session_events`, `traces`, then `sessions` WHERE id=?. Returns `changes > 0`. | Parlant: `safe_gather()` parallel event deletion, then session deletion. Ours: sequential (SQLite is single-writer anyway). |

### Session routes

**File:** `src/traces/routes.ts`

| Endpoint | Lines | Parlant equivalent | cognee equivalent |
|----------|-------|--------------------|-------------------|
| `GET /sessions` | 31-40 | `list_sessions()` | `GET /sessions` |
| `POST /sessions/:session_id/close` | 42-48 | `update_session(id, {status: ...})` | N/A |
| `DELETE /sessions/:session_id` | 50-56 | `delete_session(id)` | N/A |

### Session schemas

**File:** `src/schemas/session.ts`

| Schema | Fields | Parlant comparison |
|--------|--------|--------------------|
| `SessionListInput` | `status?: string, repo_id?: string, limit: number (1-200, default 50)` | Parlant: `agent_id?, customer_id?, limit?, cursor?, sort_direction?, labels?`. Parlant has cursor pagination; we use limit-only (simpler, sufficient for Phase 2). |
| `SessionCloseInput` | `summary?: string` | Parlant: `SessionUpdateParams` (generic). Ours: focused on the close transition. |

## Function-Level Comparison

### `list()` — `MockSessionProvider.list()` vs Parlant `list_sessions()`

| Dimension | Parlant `list_sessions()` (1169-1208) | agent-core `list()` (56-73) |
|-----------|--------------------------------------|----------------------------|
| **Lock** | `async with self._lock.reader_lock` | None (SQLite SERIALIZED mode handles concurrency) |
| **Filters** | `agent_id`, `customer_id`, `labels` | `status`, `repo_id` |
| **Pagination** | Cursor-based (`cursor`, `sort_direction`) | Limit-only (offset implicit via ORDER BY + LIMIT) |
| **Label filtering** | Post-query `issubset()` check | N/A (no labels yet) |
| **Return type** | `SessionListing(items, total_count, cursor)` | `SessionRecord[]` |
| **Query** | `_session_collection.find(filters, ...)` (MongoDB-style) | Raw SQL with parameterized WHERE clause |

**Verdict:** Parlant's is more feature-rich (cursor pagination, labels, multi-filter). agent-core's is simpler and sufficient for Phase 2. Cursor pagination and labels are Phase 3 features.

### `close()` vs Parlant's `update_session()`

| Dimension | Parlant `update_session()` (1146-1166) | agent-core `close()` (76-88) |
|-----------|---------------------------------------|------------------------------|
| **Semantics** | Generic update via `SessionUpdateParams` dict | Specific status transition: active → closed |
| **Lock** | Writer lock | No lock (SQLite) |
| **Not-found handling** | Raises `ItemNotFoundError` | Returns `null` |
| **Summary** | Separate update | Optional summary set atomically with close |

**Verdict:** agent-core's explicit `close()` is better API design for the session lifecycle — it's self-documenting and type-safe vs Parlant's generic `update_session()` which accepts any params dict.

### `delete()` vs Parlant's `delete_session()`

| Dimension | Parlant `delete_session()` (1115-1128) | agent-core `delete()` (90-96) |
|-----------|---------------------------------------|-------------------------------|
| **Event cleanup** | `safe_gather()` parallel event deletion | Sequential: `DELETE FROM session_events WHERE session_id=?` |
| **Trace cleanup** | Not shown (separate store) | `DELETE FROM traces WHERE session_id=?` |
| **Session deletion** | `_session_collection.delete_one(...)` | `DELETE FROM sessions WHERE id=?` |
| **Lock** | Writer lock | No lock (SQLite) |
| **Return** | `None` (void) | `boolean` (whether a row was actually deleted) |

**Verdict:** agent-core's boolean return is more informative — caller knows if the session existed. agent-core also cleans up traces (which Parlant doesn't in their session delete). Parlant's parallel deletion is unnecessary overhead for our SQLite backend.

### `list_sessions` endpoint — Parlant vs cognee vs agent-core

| Dimension | Parlant list API | cognee list API | agent-core list API |
|-----------|-----------------|-----------------|---------------------|
| **Filters** | agent_id, customer_id, labels | range (24h/7d/30d/all), status, user visibility | status, repo_id |
| **Pagination** | cursor + limit + sort_direction | offset + limit | limit only |
| **Response** | `{sessions, total_count, cursor}` | `{sessions, total, limit, offset, has_more}` | `{sessions}` |
| **Multi-tenancy** | Yes (agent/customer scoped) | Yes (user/child-agent scoped) | No (all sessions visible) |
| **Time filtering** | No | Yes (range parameter) | No |
| **Sort** | Configurable direction | order_by + descending | Fixed: created_at DESC |

## Competitive Assessment

| Criterion | Parlant | cognee | agent-core | Winner |
|-----------|---------|--------|------------|--------|
| Session CRUD completeness | create, read, update, delete, list, metadata | list, detail, stats | create, read, list, close, delete | Parlant (most complete) |
| Explicit close transition | No (generic update) | No | Yes (`close()` method) | agent-core |
| Delete return value | void | N/A | boolean (existence check) | agent-core |
| Cascade cleanup | Events only | N/A | Events + traces | agent-core |
| Pagination | Cursor-based | Offset-based | Limit-only | Parlant (most mature) |
| Time filtering | No | Yes (range) | No | cognee |
| Multi-tenancy | Yes | Yes | No | Parlant/cognee |
| Status filtering | No | Yes | Yes | cognee/agent-core |
| Concurrency control | Reader/writer locks | N/A | SQLite serialized | Parlant (explicit) |

**Overall verdict:** agent-core's session lifecycle is competitive for Phase 2. It provides cleaner API design than Parlant (explicit `close()` vs generic update, boolean delete return, cascade cleanup of events+traces). The main gaps vs Parlant/cognee are cursor-based pagination, multi-tenancy, and time-range filtering — all Phase 3+ features.
