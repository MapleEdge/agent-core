import { getDb } from "../db.js";

const DEFAULT_ACTIONS = [
  {
    name: "classify_task",
    description: "Classify the intent and type of a task",
    risk_level: "low",
    requires_approval: false,
  },
  {
    name: "read_file",
    description: "Read a file from the working repository",
    risk_level: "low",
    requires_approval: false,
  },
  {
    name: "grep",
    description: "Search file contents with a pattern",
    risk_level: "low",
    requires_approval: false,
  },
  {
    name: "write_file",
    description: "Write or modify a file in the working repository",
    risk_level: "medium",
    requires_approval: false,
  },
  {
    name: "run_tests",
    description: "Run the test suite for the current repo",
    risk_level: "low",
    requires_approval: false,
  },
  {
    name: "summarize_diff",
    description: "Produce a summary of recent changes",
    risk_level: "low",
    requires_approval: false,
  },
  {
    name: "request_approval",
    description: "Request approval from the platform for a gated action",
    risk_level: "low",
    requires_approval: false,
  },
  {
    name: "commit",
    description: "Commit changes to the repository",
    risk_level: "high",
    requires_approval: true,
  },
  {
    name: "search_memory",
    description: "Search the memory store for relevant entries",
    risk_level: "low",
    requires_approval: false,
  },
  {
    name: "retrieve_context",
    description: "Retrieve context nodes from the context tree",
    risk_level: "low",
    requires_approval: false,
  },
];

export function seedDefaultActions(): void {
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO actions (name, description, schema, risk_level, requires_approval)
     VALUES (?, ?, '{}', ?, ?)`,
  );
  for (const action of DEFAULT_ACTIONS) {
    insert.run(
      action.name,
      action.description,
      action.risk_level,
      action.requires_approval ? 1 : 0,
    );
  }
}
