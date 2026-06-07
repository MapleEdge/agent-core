# Phase 2B: OpenAPI Spec Generation

Auto-generated OpenAPI 3.0 specification with interactive Swagger UI.

## Vendor Source Inspected

### cognee `custom_openapi()` — manual OpenAPI override

**File:** `vendor/providers/knowledge/cognee/cognee/api/client.py`

| Function/Statement | Lines | Logic |
|-------------------|-------|-------|
| `from fastapi.openapi.utils import get_openapi` | 14 | Imports FastAPI's OpenAPI schema generator. |
| `app = FastAPI(debug=app_environment != "prod", lifespan=lifespan)` | 116 | Creates the app. Note: no `title`/`description`/`version` here — those are set in `custom_openapi()`. |
| `def custom_openapi()` | 141-174 | Builds the OpenAPI schema lazily (caches on `app.openapi_schema`). |
| `get_openapi(title="Cognee API", version="1.0.0", ...)` | 145-150 | Generates base schema from FastAPI routes. |
| `openapi_schema["components"]["securitySchemes"] = {...}` | 153-157 | Manually injects `ApiKeyAuth` (X-Api-Key header) and `BearerAuth` (Bearer token) security scheme definitions. |
| `our_security = [{"ApiKeyAuth": []}, {"BearerAuth": []}]` | 163-164 | Defines security requirement applied to all operations. |
| Loop over paths/operations to inject security | 166-170 | Iterates all operations, replaces any existing `security` block with `our_security`. |
| `app.openapi = custom_openapi` | 177 | Monkey-patches FastAPI's openapi method. |

**Key pattern:** cognee's approach is a manual post-processing step. FastAPI auto-generates the schema from Pydantic models, then cognee overrides the schema with custom security definitions. There's no explicit tag organization — tags come from route `tags=[...]` decorators on individual router endpoints.

### Parlant `create_api_app()` — declarative FastAPI constructor

**File:** `vendor/providers/policy/parlant/src/parlant/api/app.py`

| Function/Statement | Lines | Logic |
|-------------------|-------|-------|
| `api_app = FastAPI(title="Parlant API", description="API documentation for the Parlant server.", version=VERSION)` | 128-132 | Declarative: title, description, version set at construction time. FastAPI auto-generates OpenAPI schema. |
| `api_app = await authorization_policy.configure_app(api_app)` | 134 | Auth middleware is injected into the app, affecting which endpoints are accessible (including `/docs`). |
| `add_trace_id` middleware exempts `/docs`, `/redoc`, `/openapi.json` | 161-163 | Docs routes are exempt from tracing but still go through authorization (`Operation.ACCESS_API_DOCS`). |
| Route registration via separate modules | 250+ | Routes registered via `api_app.include_router(router, prefix=..., tags=[...])` — tags are per-module. |

**Key pattern:** Parlant's approach is fully declarative. No post-processing or monkey-patching. Tags come from `include_router()` calls.

### agent-core `registerOpenAPI()` — Fastify equivalent

**File:** `src/api/openapi.ts`

| Function/Statement | Lines | Logic |
|-------------------|-------|-------|
| `registerOpenAPI(app: FastifyInstance)` | 22-57 | Registers `@fastify/swagger` and `@fastify/swagger-ui` plugins. |
| `app.register(swagger.default, { openapi: {...} })` | 26-49 | Declarative OpenAPI 3.0 config: `info.title`, `info.description`, `info.version`, `servers`, `tags`. |
| `tags` array | 36-47 | Explicit tag definitions for all 10 API domains (memory, context, sessions, traces, actions, rules, classify, policy, providers, mock-platform). |
| `app.register(swaggerUi.default, { routePrefix: "/docs", ... })` | 51-57 | Serves Swagger UI at `/docs` with list expansion and deep linking. |

## Function-Level Comparison

| Dimension | cognee `custom_openapi()` | Parlant `FastAPI(...)` | agent-core `registerOpenAPI()` | Verdict |
|-----------|--------------------------|----------------------|-------------------------------|---------|
| **Schema generation** | `get_openapi()` + manual post-processing | Implicit from Pydantic models | `@fastify/swagger` from route schemas | Parity — all three auto-generate from route definitions |
| **Security scheme injection** | Manual dict mutation (lines 153-170) | Via `authorization_policy.configure_app()` | Not in OpenAPI spec (auth is a separate middleware) | cognee more explicit in spec; agent-core separates concerns |
| **Tag organization** | Implicit from route `tags=[]` decorators | Implicit from `include_router(tags=[])` | **Explicit tag definitions** with descriptions (lines 36-47) | agent-core — explicit tags with descriptions improve /docs UX |
| **Caching** | `if app.openapi_schema: return` (manual) | Built into FastAPI | Built into @fastify/swagger | Parity |
| **UI endpoint** | FastAPI serves at `/docs` automatically | FastAPI serves at `/docs` automatically | `@fastify/swagger-ui` at `/docs` | Parity |
| **Monkey-patching** | `app.openapi = custom_openapi` (line 177) | None | None | agent-core + Parlant cleaner |
| **API versioning** | `version="1.0.0"` hardcoded | `version=VERSION` from module | `version: "0.1.0"` | Parity |

## Competitive Assessment

| Criterion | cognee | Parlant | agent-core | Winner |
|-----------|--------|---------|------------|--------|
| Schema auto-generation | Yes (FastAPI) | Yes (FastAPI) | Yes (@fastify/swagger) | Parity |
| Security schemes in spec | Yes (manual) | Implicit | No (separate middleware) | cognee (spec completeness) |
| Tag definitions | Implicit | Implicit | Explicit with descriptions | agent-core (discoverable) |
| Code cleanliness | Monkey-patched | Declarative | Declarative | Parlant/agent-core |
| Interactive docs | /docs (Swagger UI) | /docs (Swagger UI) | /docs (Swagger UI) | Parity |

**Overall verdict:** Functionally competitive. All three generate OpenAPI specs from route schemas and serve interactive docs. agent-core's explicit tag definitions with descriptions are an improvement over both vendors' implicit tagging. The main gap is that agent-core doesn't yet define security schemes in the OpenAPI spec — this is a Phase 3 improvement once auth is fully productionized.
