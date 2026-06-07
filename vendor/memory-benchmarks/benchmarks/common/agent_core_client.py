"""
Agent-Core Client
=================

Drop-in replacement for Mem0Client that routes all operations through
agent-core's HTTP API, exercising the full production path:

  benchmark runner
  → agent-core HTTP API  (/memory/ingest, /memory/recall, /memory/users/:id)
  → Mem0MemoryProvider
  → Mem0EmbeddedTransport
  → worker.py JSON-RPC
  → mem0.Memory

Usage:
  Replace Mem0Client with AgentCoreClient in benchmark runners:

    from benchmarks.common.agent_core_client import AgentCoreClient
    client = AgentCoreClient(host="http://localhost:3000")

The interface is identical to Mem0Client.add / .search / .delete_user.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any

import aiohttp
from aiolimiter import AsyncLimiter

logger = logging.getLogger(__name__)


class AgentCoreClient:
    """Async client that talks to agent-core's memory API.

    Implements the same interface as Mem0Client (add, search, delete_user, close)
    so benchmark runners can swap in without code changes.
    """

    def __init__(
        self,
        host: str | None = None,
        max_retries: int = 5,
        retry_delay: float = 5.0,
        rpm: int = 60,
        timeout: float = 300.0,
    ):
        default_host = "http://localhost:3000"
        self.host = (host or os.getenv("AGENT_CORE_HOST", default_host)).rstrip("/")
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.timeout = aiohttp.ClientTimeout(total=timeout)
        self.limiter = AsyncLimiter(100000, 60)
        self._session: aiohttp.ClientSession | None = None
        # Track latencies for reporting
        self.latencies: list[dict[str, Any]] = []

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            connector = aiohttp.TCPConnector(limit=0)
            self._session = aiohttp.ClientSession(
                headers={"Content-Type": "application/json"},
                timeout=self.timeout,
                connector=connector,
            )
        return self._session

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()

    async def __aenter__(self) -> AgentCoreClient:
        return self

    async def __aexit__(self, *exc: Any) -> None:
        await self.close()

    async def add(
        self,
        messages: list[dict[str, str]],
        user_id: str,
        observation_date: str | None = None,
        timestamp: int | None = None,
        custom_instructions: str | None = None,
        metadata: dict | None = None,
    ) -> dict | None:
        """Add memories via agent-core's /memory/ingest endpoint."""
        session = await self._get_session()

        payload: dict[str, Any] = {
            "messages": messages,
            "user_id": user_id,
        }
        if timestamp is not None:
            payload["timestamp"] = timestamp
        elif observation_date is not None:
            try:
                d = datetime.strptime(observation_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                payload["timestamp"] = int(d.timestamp())
            except ValueError:
                pass
        if custom_instructions:
            payload["custom_instructions"] = custom_instructions
        if metadata:
            payload["metadata"] = metadata

        for attempt in range(self.max_retries):
            try:
                t0 = time.monotonic()
                async with self.limiter:
                    async with session.post(f"{self.host}/memory/ingest", json=payload) as resp:
                        if resp.status >= 500:
                            raise aiohttp.ClientResponseError(
                                resp.request_info, resp.history, status=resp.status
                            )
                        resp.raise_for_status()
                        data = await resp.json()
                elapsed = time.monotonic() - t0

                self.latencies.append({
                    "op": "add",
                    "user_id": user_id,
                    "elapsed_s": elapsed,
                    "transport": data.get("_transport", "unknown"),
                    "mem0_latency_ms": data.get("_latency_ms"),
                })

                # Normalise to match Mem0Client output shape
                if isinstance(data, dict) and "results" in data:
                    return data
                return {"results": data.get("results", [])}

            except Exception as exc:
                logger.warning(
                    "ADD attempt %d/%d failed (user=%s): %s",
                    attempt + 1, self.max_retries, user_id, str(exc)[:200],
                )
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay * (attempt + 1))
                else:
                    logger.error("ADD failed after %d attempts for user=%s", self.max_retries, user_id)
                    return None

    async def search(
        self,
        query: str,
        user_id: str,
        top_k: int = 200,
        rerank: bool = False,
        score_debug: bool = False,
    ) -> list[dict]:
        """Search memories via agent-core's /memory/recall endpoint."""
        session = await self._get_session()
        payload: dict[str, Any] = {
            "query": query,
            "user_id": user_id,
            "limit": top_k,
        }
        if rerank:
            payload["rerank"] = True

        for attempt in range(self.max_retries):
            try:
                t0 = time.monotonic()
                async with self.limiter:
                    async with session.post(f"{self.host}/memory/recall", json=payload) as resp:
                        if resp.status >= 500:
                            raise aiohttp.ClientResponseError(
                                resp.request_info, resp.history, status=resp.status
                            )
                        resp.raise_for_status()
                        data = await resp.json()
                elapsed = time.monotonic() - t0

                self.latencies.append({
                    "op": "search",
                    "user_id": user_id,
                    "query": query[:100],
                    "elapsed_s": elapsed,
                    "transport": data.get("_transport", "unknown"),
                    "mem0_latency_ms": data.get("_latency_ms"),
                })

                # Normalise results
                results = data.get("results", data) if isinstance(data, dict) else data
                if not isinstance(results, list):
                    results = []

                normalised = []
                for r in results:
                    entry: dict[str, Any] = {
                        "memory": r.get("memory", r.get("data", "")),
                        "score": r.get("score", 0),
                        "id": r.get("id", ""),
                    }
                    if r.get("created_at"):
                        entry["created_at"] = r["created_at"]
                    if r.get("updated_at"):
                        entry["updated_at"] = r["updated_at"]
                    normalised.append(entry)

                normalised.sort(key=lambda x: x.get("score", 0), reverse=True)
                return normalised

            except Exception as exc:
                logger.warning(
                    "SEARCH attempt %d/%d failed (user=%s): %s",
                    attempt + 1, self.max_retries, user_id, str(exc)[:200],
                )
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay * (attempt + 1))
                else:
                    logger.error("SEARCH failed after %d attempts for user=%s", self.max_retries, user_id)
                    return []

    async def delete_user(self, user_id: str) -> bool:
        """Delete all memories for a user via agent-core's DELETE /memory/users/:id."""
        session = await self._get_session()
        try:
            async with self.limiter:
                async with session.delete(f"{self.host}/memory/users/{user_id}") as resp:
                    resp.raise_for_status()
            logger.info("Deleted memories for user %s via agent-core", user_id)
            return True
        except Exception as exc:
            logger.warning("Failed to delete user %s: %s", user_id, exc)
            return False

    def get_latency_report(self) -> dict[str, Any]:
        """Compute latency breakdown from collected measurements."""
        if not self.latencies:
            return {"count": 0}

        add_lats = [e["elapsed_s"] for e in self.latencies if e["op"] == "add"]
        search_lats = [e["elapsed_s"] for e in self.latencies if e["op"] == "search"]
        mem0_lats = [
            e["mem0_latency_ms"] / 1000
            for e in self.latencies
            if e.get("mem0_latency_ms") is not None
        ]

        def stats(values: list[float]) -> dict[str, float]:
            if not values:
                return {}
            values.sort()
            n = len(values)
            return {
                "count": n,
                "mean_s": sum(values) / n,
                "p50_s": values[n // 2],
                "p95_s": values[int(n * 0.95)],
                "p99_s": values[int(n * 0.99)],
            }

        transport = "unknown"
        for e in self.latencies:
            if e.get("transport") and e["transport"] != "unknown":
                transport = e["transport"]
                break

        return {
            "transport": transport,
            "provider": "mem0",
            "total_operations": len(self.latencies),
            "add": stats(add_lats),
            "search": stats(search_lats),
            "mem0_internal": stats(mem0_lats),
        }
