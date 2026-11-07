---
name: opengeo-data-instrumentation
description: Define measurable GEO events and evidence fields before optimizing AI answer visibility.
---

# Data Instrumentation

Define the minimum event set: answer observed, answer judged, asset published, and owned-channel engagement. Keep collection separate from judgment. A failed sample is not a negative mention.

Required fields:

- `cycle`, `query_id`, `platform`, `observed_at`, and raw answer text for observations.
- Citation type and URL.
- Publication state and accessibility check time.
- Owned metrics with their source and time range.

Do not infer engagement, conversion, citation, or platform weight without the corresponding event.

