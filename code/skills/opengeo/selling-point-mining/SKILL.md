---
name: opengeo-selling-point-mining
description: Decompose existing articles into query-aligned GEO selling points and evidence gaps.
---

# Selling Point Mining

For each confirmed query, identify sentences in existing assets that answer the intent. Output:

- Query ID.
- Asset ID.
- Evidence quote.
- Match score and reason.
- `usable` or `needs_review`.

A selling point is not a claim. It must trace to an asset and may only enter a draft after fact review. Low lexical overlap is a review signal, not proof of semantic mismatch.

