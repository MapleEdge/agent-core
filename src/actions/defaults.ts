/**
 * Backwards-compatible re-export of seedDefaultActions.
 *
 * Delegates to the canonical catalog seed. Existing call sites
 * (tests, server startup) continue to work without changes.
 */

import { seedCanonicalCatalog } from "./catalog/seedCanonicalActions.js";

export { seedCanonicalCatalog as seedDefaultActions };
