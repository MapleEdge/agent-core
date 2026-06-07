#!/usr/bin/env python3
"""
Mem0 embedded worker — JSON-RPC over stdin/stdout.

Spawned by agent-core's Mem0MemoryProvider as a child process.
Receives JSON-RPC requests on stdin, writes responses to stdout.
All logging goes to stderr to avoid corrupting the JSON stream.

Protocol:
  Request:  {"id": 1, "method": "add", "params": {...}}
  Response: {"id": 1, "result": {...}}
  Error:    {"id": 1, "error": {"code": -1, "message": "..."}}

Lifecycle:
  - Worker initializes mem0 Memory instance on startup
  - Reads one JSON line per request from stdin
  - Writes one JSON line per response to stdout
  - Exits cleanly on stdin EOF or "shutdown" method
"""

import json
import logging
import os
import sys
import traceback
from typing import Any, Dict, Optional

# Route all logging to stderr — stdout is reserved for JSON-RPC
logging.basicConfig(
    stream=sys.stderr,
    level=logging.INFO,
    format="[mem0-worker] %(levelname)s %(message)s",
)
log = logging.getLogger("mem0-worker")

# Disable mem0 telemetry in worker mode
os.environ["MEM0_TELEMETRY"] = "false"

# ── Use vendored mem0 source (committed patches) instead of site-packages ──
# worker.py lives at <repo>/vendor/mem0/worker.py
# vendored mem0 lives at <repo>/vendor/providers/memory/mem0/
# Prepending this to sys.path ensures `import mem0` resolves to the vendored
# copy with Voyage compatibility patches, not the pip-installed package.
_WORKER_DIR = os.path.dirname(os.path.abspath(__file__))
_VENDOR_MEM0_DIR = os.path.normpath(
    os.path.join(_WORKER_DIR, "..", "providers", "memory", "mem0")
)
if os.path.isdir(_VENDOR_MEM0_DIR):
    # Remove any existing mem0 paths to avoid shadowing
    sys.path = [p for p in sys.path if "mem0" not in os.path.basename(p)]
    sys.path.insert(0, _VENDOR_MEM0_DIR)
    log.info("Using vendored mem0 from %s", _VENDOR_MEM0_DIR)
else:
    log.warning(
        "Vendored mem0 not found at %s — falling back to site-packages",
        _VENDOR_MEM0_DIR,
    )


def create_memory_instance():
    """Initialize mem0 Memory with config from environment."""
    try:
        from mem0 import Memory
        import mem0.embeddings.openai as _emb_mod

        # Log proof of which mem0 source is active
        _emb_file = getattr(_emb_mod, "__file__", "unknown")
        _is_vendored = "vendor" in _emb_file
        log.info(
            "mem0 embeddings source: %s (vendored=%s)",
            _emb_file, _is_vendored,
        )

        config: Dict[str, Any] = {}

        # Vector store config
        vector_provider = os.environ.get("MEM0_VECTOR_PROVIDER", "qdrant")
        vector_config: Dict[str, Any] = {}

        if vector_provider == "qdrant":
            vector_config = {
                "collection_name": os.environ.get("MEM0_COLLECTION", "agent_core_memories"),
                "path": os.environ.get("MEM0_QDRANT_PATH", os.path.expanduser("~/.mem0/qdrant")),
            }
        elif vector_provider == "pgvector":
            vector_config = {
                "host": os.environ.get("MEM0_PG_HOST", "localhost"),
                "port": int(os.environ.get("MEM0_PG_PORT", "5432")),
                "dbname": os.environ.get("MEM0_PG_DB", "mem0"),
                "user": os.environ.get("MEM0_PG_USER", "postgres"),
                "password": os.environ.get("MEM0_PG_PASSWORD", ""),
                "collection_name": os.environ.get("MEM0_COLLECTION", "agent_core_memories"),
            }

        # Sync vector store dimensions with embedder dimensions
        embedder_dims = os.environ.get("MEM0_EMBEDDER_DIMS")
        if embedder_dims:
            vector_config["embedding_model_dims"] = int(embedder_dims)

        config["vector_store"] = {
            "provider": vector_provider,
            "config": vector_config,
        }

        # LLM config
        llm_provider = os.environ.get("MEM0_LLM_PROVIDER", "openai")
        llm_config: Dict[str, Any] = {
            "model": os.environ.get("MEM0_LLM_MODEL", "gpt-4.1-nano-2025-04-14"),
            "temperature": 0.2,
        }
        api_key = os.environ.get("MEM0_LLM_API_KEY") or os.environ.get("OPENAI_API_KEY")
        if api_key:
            llm_config["api_key"] = api_key
        api_base = os.environ.get("MEM0_LLM_BASE_URL")
        if api_base:
            # Provider-specific base URL key
            if llm_provider == "deepseek":
                llm_config["deepseek_base_url"] = api_base
            else:
                llm_config["openai_base_url"] = api_base

        config["llm"] = {"provider": llm_provider, "config": llm_config}

        # Embedder config
        embedder_provider = os.environ.get("MEM0_EMBEDDER_PROVIDER", "openai")
        embedder_config: Dict[str, Any] = {
            "model": os.environ.get("MEM0_EMBEDDER_MODEL", "text-embedding-3-small"),
        }
        embedder_key = os.environ.get("MEM0_EMBEDDER_API_KEY") or api_key
        if embedder_key:
            embedder_config["api_key"] = embedder_key
        embedder_base_url = os.environ.get("MEM0_EMBEDDER_BASE_URL")
        if embedder_base_url:
            embedder_config["openai_base_url"] = embedder_base_url
        embedder_dims = os.environ.get("MEM0_EMBEDDER_DIMS")
        if embedder_dims:
            embedder_config["embedding_dims"] = int(embedder_dims)

        config["embedder"] = {"provider": embedder_provider, "config": embedder_config}

        # History DB
        config["history_db_path"] = os.environ.get(
            "MEM0_HISTORY_DB",
            os.path.expanduser("~/.mem0/history.db"),
        )

        # Version
        config["version"] = os.environ.get("MEM0_API_VERSION", "v1.1")

        memory = Memory.from_config(config)
        log.info("mem0 Memory initialized (vector=%s, llm=%s)", vector_provider, llm_provider)
        return memory
    except Exception as e:
        log.error("Failed to initialize mem0: %s", e)
        raise


def handle_request(memory, request: Dict[str, Any]) -> Dict[str, Any]:
    """Dispatch a JSON-RPC request to the appropriate mem0 method."""
    req_id = request.get("id")
    method = request.get("method", "")
    params = request.get("params", {})

    try:
        result = dispatch(memory, method, params)
        return {"id": req_id, "result": result}
    except Exception as e:
        log.error("Error in %s: %s\n%s", method, e, traceback.format_exc())
        return {"id": req_id, "error": {"code": -1, "message": str(e)}}


def dispatch(memory, method: str, params: Dict[str, Any]) -> Any:
    """Route method to mem0 Memory calls."""

    if method == "add":
        messages = params.get("messages", [])
        kwargs = {k: v for k, v in params.items() if k != "messages" and v is not None}
        return memory.add(messages=messages, **kwargs)

    elif method == "search":
        query = params["query"]
        kwargs = {k: v for k, v in params.items() if k != "query" and v is not None}
        return memory.search(query=query, **kwargs)

    elif method == "get":
        return memory.get(params["memory_id"])

    elif method == "get_all":
        kwargs = {k: v for k, v in params.items() if v is not None}
        return memory.get_all(**kwargs)

    elif method == "update":
        return memory.update(
            memory_id=params["memory_id"],
            data=params.get("data", ""),
            metadata=params.get("metadata"),
        )

    elif method == "delete":
        memory.delete(memory_id=params["memory_id"])
        return {"success": True}

    elif method == "delete_all":
        kwargs = {k: v for k, v in params.items() if v is not None}
        memory.delete_all(**kwargs)
        return {"success": True}

    elif method == "history":
        return memory.history(memory_id=params["memory_id"])

    elif method == "ping":
        return {"status": "ok"}

    elif method == "shutdown":
        log.info("Shutdown requested")
        return {"status": "shutting_down"}

    else:
        raise ValueError(f"Unknown method: {method}")


def main():
    """Main loop: read JSON-RPC from stdin, write responses to stdout."""
    log.info("Starting mem0 worker (pid=%d)", os.getpid())

    memory: Optional[Any] = None

    # Attempt initialization — report error but stay alive for ping/shutdown
    try:
        memory = create_memory_instance()
    except Exception as e:
        log.error("Worker started without mem0 instance: %s", e)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
        except json.JSONDecodeError as e:
            response = {"id": None, "error": {"code": -32700, "message": f"Parse error: {e}"}}
            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()
            continue

        method = request.get("method", "")

        # Handle control methods without memory instance
        if method == "ping":
            response = {
                "id": request.get("id"),
                "result": {"status": "ok", "initialized": memory is not None},
            }
        elif method == "shutdown":
            response = {"id": request.get("id"), "result": {"status": "shutting_down"}}
            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()
            break
        elif memory is None:
            response = {
                "id": request.get("id"),
                "error": {"code": -1, "message": "mem0 not initialized — check worker logs"},
            }
        else:
            response = handle_request(memory, request)

        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()

    log.info("Worker exiting")


if __name__ == "__main__":
    main()
