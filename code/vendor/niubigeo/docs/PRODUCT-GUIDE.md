<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../assets/brand/niubigeo-lockup.svg">
  <source media="(prefers-color-scheme: light)" srcset="../assets/brand/niubigeo-lockup-light.svg">
  <img src="../assets/brand/niubigeo-lockup-light.svg" alt="NiubiGEO" width="360">
</picture>

# Open the GEO reporting black box. Put evidence in your hands.

**Does AI know your product? How does it describe you? Who appears when nobody names your brand?**

NiubiGEO is an open-source, self-hosted tool for observing brand visibility and competitors in AI answers.<br>
Enter a domain, choose models, and inspect their answers, competing products, keywords and returned sources.

[![GitHub stars](https://img.shields.io/github/stars/Albert-Weasker/niubigeo?style=for-the-badge)](https://github.com/Albert-Weasker/niubigeo)
[![Latest release](https://img.shields.io/github/v/release/Albert-Weasker/niubigeo?style=for-the-badge)](https://github.com/Albert-Weasker/niubigeo/releases)
[![Apache-2.0](https://img.shields.io/badge/LICENSE-Apache--2.0-2563eb?style=for-the-badge)](../LICENSE)
[![Self-hosted](https://img.shields.io/badge/SELF--HOSTED-YES-111827?style=for-the-badge)](deployment/docker.md)

**[⚡ Self-host now](#run-it-now) · [◉ Explore real cases](../examples/README.md) · [↗ Official services](https://niubigeo.ai/) · [✦ AI advisor](https://video.niubistar.com/niubigeo)**

[简体中文](PRODUCT-GUIDE.zh-CN.md) · [Project home](../README.md) · [Releases](https://github.com/Albert-Weasker/niubigeo/releases)

</div>

## You need the answers behind the score

More people ask AI which products solve a problem, which one fits their needs, and what alternatives they should consider. Your product may be indexed by search engines, yet AI may still:

- Leave it out entirely.
- Recognize the brand but misunderstand the product.
- Describe only part of what it does.
- Name a competitor first in an important use case.
- Cite a third-party page while overlooking your official information.

A percentage alone cannot explain any of this. NiubiGEO keeps the questions, models, search settings, original answers and sources together, so you can trace each finding back to its evidence.

<div align="center">

**QUESTION → MODEL → ANSWER → SOURCE → EVIDENCE**

Inspect the question. Read the full answer. Treat each run as an observation, not a permanent ranking.

</div>

## Four things to inspect in one run

<table>
<tr>
<td width="50%" valign="top">
<h3>01 · How AI understands you</h3>
<p>Does it recognize your domain?<br>
What does it call the brand, what does it think you do, and in which category?<br>
Do different models agree?</p>
</td>
<td width="50%" valign="top">
<h3>02 · Who appears alongside you</h3>
<p>Which products does AI associate with yours?<br>
Which keywords and use cases connect them?<br>
Which results need a closer look?</p>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<h3>03 · Who appears without your name</h3>
<p>Test the neutral keywords you confirm.<br>
See whether an answer names your brand, another product,<br>
or simply explains a concept.</p>
</td>
<td width="50%" valign="top">
<h3>04 · Where each finding comes from</h3>
<p>Open full answers, text locations and returned sources.<br>
Provider citations and ordinary answer URLs stay separate.<br>
Failures and uncertain results remain visible.</p>
</td>
</tr>
</table>

> [!IMPORTANT]
> **Brand recognition is different from natural discovery.** A model recognizing your domain when asked about it does not show that it will mention or recommend you when someone asks about a category. NiubiGEO presents these tests separately.

## Evidence you can inspect

| What you need to check | What NiubiGEO retains |
| :--- | :--- |
| What question did AI answer? | The test protocol, question and keyword |
| Which model answered? | Provider, model and run records |
| Was web search requested? | Per-model search settings and recorded execution information |
| Was the product mentioned or recommended? | Original wording, text locations and judgments |
| Where did this source come from? | Provider citations recorded separately from ordinary URLs in the answer |
| Did a run fail? | Errors, failed attempts and uncertain states |
| What is behind a historical data point? | The underlying run and original answers |

<details>
<summary><strong>Why not just show a visibility percentage?</strong></summary>

A percentage needs a clear test scope and denominator. NiubiGEO preserves the models, keywords, search settings, test rounds and analyzable results behind a summary. You can return to individual answers to check what the number means. See the [measurement methodology](measurement-methodology.md).

</details>

<details>
<summary><strong>What happens when the evidence is incomplete?</strong></summary>

Failures, ambiguity and insufficient evidence stay failed or uncertain. They are available to inspect and retry; they do not become invented findings to fill a report. Current analysis and evidence limits are documented in [Known issues](known-issues.md).

</details>

## From a domain to evidence you can revisit

```mermaid
flowchart LR
    A["Enter a domain"] --> B["Choose models<br/>Set web search"]
    B --> C["Establish a recognition baseline"]
    C --> D["Confirm keywords"]
    D --> E["Test natural discovery"]
    E --> F["Inspect answers and sources"]
    F --> G["Repeat measurements"]
```

1. **Enter a domain.** Create a separate project for your product.
2. **Choose models.** Search for one or more OpenRouter models and set web search independently for each.
3. **Establish a baseline.** Check whether each model recognizes the brand, how it describes the product, and which competing products it names.
4. **Confirm keywords.** Choose the neutral category terms and use cases you want to observe.
5. **Test discovery.** Ask without naming the target brand and inspect who actually appears.
6. **Check the evidence.** Read the original answers, text locations, returned sources, failures and uncertain results.
7. **Keep observing.** Repeat the same scope or add a schedule to accumulate comparable records.

## Run it now

### Node.js

You need **Node.js 22.13+** and your own **OpenRouter API key**. These commands install the tagged **v0.2.0** release:

```bash
git clone --branch v0.2.0 --depth 1 https://github.com/Albert-Weasker/niubigeo.git
cd niubigeo
npm ci
cp .env.example .env
```

Set your key in `.env`:

```dotenv
OPENROUTER_API_KEY=your_key_here
```

Start the workbench:

```bash
npm run server
```

Open [http://localhost:8787](http://localhost:8787) and create your first project.

### Docker Compose

From a fresh checkout:

```bash
git clone --branch v0.2.0 --depth 1 https://github.com/Albert-Weasker/niubigeo.git
cd niubigeo
cp .env.example .env
```

Set `OPENROUTER_API_KEY` in `.env`, then build and start the workbench:

```bash
docker compose up --build -d
```

Open [http://localhost:8787](http://localhost:8787). Compose builds from the checked-out source; the [Docker deployment guide](deployment/docker.md) also documents the published v0.2.0 image.

**Scheduled execution needs a separate worker.** It is optional and disabled in the default Compose command. To run your configured schedules, start it explicitly; due tasks make model calls using your key:

```bash
docker compose --profile monitoring up --build -d niubigeo-worker
```

For data persistence, worker configuration and updates, see [Docker deployment](deployment/docker.md) and [Backups and upgrades](upgrade.md).

> [!TIP]
> Want to look first? Browse [20 real open-source cases](../examples/README.md) without installing anything or supplying a key. Each case preserves its test conditions, results, original answers, screenshots and failure records.

## Built for continued observation

| What you want to do | How NiubiGEO helps |
| :--- | :--- |
| Manage several products | Each domain has its own project, settings, runs and evidence |
| Compare models | Each model runs independently; one failure does not erase the other results |
| Separate web-enabled and offline tests | Set search per model and retain recorded execution conditions |
| Check brand recognition | Inspect brand names, product descriptions, categories, competing products and associated keywords |
| Check natural discovery | Test neutral keywords without including the target brand name |
| Verify a finding | Return to full answers, text locations and sources |
| Observe changes over time | Repeat tests or schedule them, then trace historical points back to their evidence |

### Your deployment. Your key. Your records.

- **Open source:** Community Edition uses the [Apache-2.0 license](../LICENSE).
- **Self-hosted:** Projects and run records stay in your deployment.
- **Bring your own key:** Use your OpenRouter API key and choose the models you run.
- **Traceable:** Check findings against the original answers, sources and test conditions.
- **Answer language:** Choose English or Simplified Chinese. Some v0.2.0 interface text remains in Chinese; see the [release notes](releases/v0.2.0.md) for language support.

## Start with real cases

These are public-product observations from the open-source case collection, recorded on September 8, 2026.

| Case | What to inspect |
| :--- | :--- |
| [Notion · R08](../examples/cases/R08/README.md) | How models describe one product differently and name different competing products |
| [Figma · R14](../examples/cases/R14/README.md) | Whether a neutral keyword produces product names or a concept explanation |
| [PostHog · R04](../examples/cases/R04/README.md) | Provider citations, preserved failures and original answers behind repeated measurements |

<details>
<summary><strong>Notion: compare the original model results</strong></summary>

[![Notion: original model descriptions, competing products and keywords](../assets/screenshots/v0.2.0-rc.1/R08-models.png)](../examples/cases/R08/README.md)

The models emphasized notes, a workspace and collaboration differently. These are prompted descriptions from this test, not evidence of unprompted recommendations. [Read the case and answers](../examples/cases/R08/README.md).

</details>

<details>
<summary><strong>Figma: inspect a keyword test without the brand name</strong></summary>

[![Figma: actual neutral keyword measurements](../assets/screenshots/v0.2.0-rc.1/R14-keywords.png)](../examples/cases/R14/README.md)

For **Prototyping**, two offline answers mainly explained the concept; an answer with native search requested named Figma. A mention, a positive description and an explicit recommendation are different observations. [Inspect the original answer](../examples/cases/R14/README.md#attempt-2afd57bb-3566-40f2-b339-995bd17b3687).

</details>

<details>
<summary><strong>PostHog: follow a measurement point to its evidence</strong></summary>

[![PostHog: a measurement point and original-answer evidence](../assets/screenshots/v0.2.0-rc.1/R04-point-evidence.png)](../examples/cases/R04/README.md)

The case includes three closely spaced measurements, one triggered by a schedule, with partial results and failed attempts retained. It demonstrates repeated measurement, not long-term growth. [Inspect the sources and runs](../examples/cases/R04/README.md).

</details>

**[Browse all 20 real cases →](../examples/README.md)**

## Optional help after you find a problem

Community Edition lets you measure and inspect the evidence yourself. If you need help checking consumer AI products or acting on findings, optional official services cover four areas. A paid diagnostic report combines API testing with human review and action suggestions; [ask about the scope](https://niubigeo.ai/) or [talk to the AI advisor](https://video.niubistar.com/niubigeo).

| Official service | When it helps | Delivery focus |
| :--- | :--- | :--- |
| AI visibility diagnosis | You want the team to run API tests and review the findings | Original answers, sources, human review and action suggestions |
| Human AI testing | You need specified regions, languages, platforms, or web and app interfaces | Actual answers, screenshots, brand appearances and returned sources |
| GEO content improvements | Product information is missing, outdated or misunderstood | Specific edits, approved content and retesting within the agreed scope |
| Content and publishing | You want tutorials, product introductions or articles on selected websites | Free writing and revisions, your approval before publication, and published links |

<details>
<summary><strong>What is Growth Canvas?</strong></summary>

Growth Canvas is the official platform’s visual promotion planner. Enter a product or GitHub link, choose a recommended flow or customize task nodes, and combine target-user recruitment, product trials, community and creator distribution, website article publishing and GEO retesting in one plan. The dashboard keeps budgets, project progress and deliveries together. Growth Canvas belongs to the separate hosted platform and is not installed with Community Edition.

</details>

**Using the open-source edition requires no service purchase or NiubiStar account.**

### NiubiStar × NiubiGEO

[NiubiStar](https://www.niubistar.com/) supports NiubiGEO’s open-source development and provides the global human execution network and related promotion resources for optional official services. Open-source diagnostics make questions, answers and sources inspectable; human testing can check actual consumer experiences in specified regions and languages.

## FAQ

<details>
<summary><strong>Is NiubiGEO free?</strong></summary>

Community Edition is free and open source under Apache-2.0. Bring your own OpenRouter API key and cover the model, search-service and hosting costs you incur. Reading the public cases needs no API key.

</details>

<details>
<summary><strong>Can I test without web search?</strong></summary>

Yes. Each model has its own search setting: offline or its supported Provider-native search mode. The records distinguish what was requested from the execution information returned by the Provider. A requested mode alone does not prove search ran; compare results under matching conditions.

</details>

<details>
<summary><strong>Can I read the original answers and sources?</strong></summary>

Yes. Open a result to inspect its full answer, available text locations and source records. Provider citations are separate from ordinary URLs in the response. Failed attempts and uncertain results remain available, too. See [Sources and evidence](evidence-model.md).

</details>

<details>
<summary><strong>Why can an API result differ from the web or mobile app?</strong></summary>

Model versions, system instructions, search capabilities, region, account state and interface behavior can differ. Community Edition records Provider API observations. Optional human AI testing can check specified consumer web or app environments.

</details>

<details>
<summary><strong>Does monitoring start with the workbench?</strong></summary>

No. You can repeat tests manually with the workbench alone. Scheduled execution requires a separate monitoring worker using the same data directory. The default Compose startup leaves it disabled; enable the monitoring profile when you want configured schedules to run. Due tasks incur API charges. See [Docker deployment](deployment/docker.md).

</details>

<details>
<summary><strong>Will website changes appear immediately in AI answers?</strong></summary>

Not necessarily. Discovery, crawling, retrieval and answer generation take time and differ across models and products. Keep the test scope consistent, retain the evidence and observe repeated measurements; a single fluctuation does not establish a trend or the effect of an edit.

</details>

<details>
<summary><strong>Does buying a service guarantee an AI recommendation?</strong></summary>

No. AI platforms determine their answers. Official services can help improve product information, prepare content, arrange publication and retest agreed questions, without guaranteeing indexing, citations, rankings or recommendations. Traditional search-engine rank tracking is not included in Community Edition.

</details>

<details>
<summary><strong>How should I interpret metrics and citations?</strong></summary>

Read the [measurement methodology](measurement-methodology.md), [sources and evidence](evidence-model.md), [limitations](limitations.md) and [known issues](known-issues.md). A citation helps you check an answer; by itself, it does not establish that the source caused a recommendation.

</details>

<a id="learning-resources"></a>

## GEO resources

Learn about GEO on the official NiubiGEO website:

[Resources overview](https://niubigeo.ai/resources) · [GEO principles](https://niubigeo.ai/resources/principles) · [Optimization methods](https://niubigeo.ai/resources/methods) · [GEO glossary](https://niubigeo.ai/resources/glossary).

---

<div align="center">

**GEO should be an evidence trail you can inspect for yourself.**

[⚡ Deploy NiubiGEO](#run-it-now) · [◉ Explore real cases](../examples/README.md) · [↗ Official website](https://niubigeo.ai/) · [✦ AI advisor](https://video.niubistar.com/niubigeo)

Product and service enquiries: [support@niubigeo.ai](mailto:support@niubigeo.ai)<br>
[GitHub Issues](https://github.com/Albert-Weasker/niubigeo/issues) · [Contributing](../CONTRIBUTING.md)

<sub>Open source under Apache-2.0 · Built with evidence, not promises.</sub>

</div>
