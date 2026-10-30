# GEO Standards and Interoperability References

## Web discovery

- robots.txt: <https://developers.google.com/search/docs/crawling-indexing/robots/intro>
- Sitemaps: <https://www.sitemaps.org/>
- Google AI search documentation: <https://developers.google.com/search/docs/appearance/ai-features>

OpenGEO treats these as crawlability and discoverability inputs. A file being present does not prove that a model reads it, prefers it, or cites it.

## llms.txt

- Proposal: <https://llmstxt.org/>

OpenGEO can parse and archive llms.txt as a content navigation hint. It must not claim that llms.txt guarantees indexing or citation.

## Agent Skills

- Specification: <https://agentskills.io/specification>

OpenGEO Skill directories use compatible `SKILL.md` frontmatter with `name` and `description`, then add OpenGEO-specific input, output, evidence, and confirmation requirements.

## Model Context Protocol

- Specification: <https://modelcontextprotocol.io/>

MCP is planned as an OpenGEO host interface so coding and research agents can call diagnosis, source analysis, planning, content, import, and reporting tools.

