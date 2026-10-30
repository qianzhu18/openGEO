# PostHog · GEO 工作流报告

运行 ID：03bba9ff-d51b-4c15-8f01-7a445852c7ae

时间：2026-10-29T12:04:23.548Z

数据类型：上游历史归档回放，无新模型调用

目标：回放真实历史回答，区分原文、解析失败、引用与正文链接，形成可检查的下一步任务。

## 诊断

- 计划样本：27
- 已取得原文：27
- 已完成分析：24
- 采集失败：0
- 分析未完成：3
- 品牌字面提及：37.5%（9/24）
- 推荐措辞规则判定：0.0%（0/15）
- Provider 引用项：3
- 搜索结果项：0
- Grounding 来源项：0
- 正文 URL 项：12

品牌词、非品牌词、模型与运行批次按分组查看，合计数只用于描述本次输入集合，不代表平台总体推荐率。推荐判定为文本规则，需要复核。

## 策略任务

### P0 · 复核失败样本，保留已有回答原文

3 条记录采集或分析未完成，不能作为未提及统计。

验收：先重做本地解析；需要重新采集时创建新尝试，不覆盖旧记录。

问题：watch-keyword-532e310d54beebe2356227d4

样本：d85e30b0-0dd7-46d9-900c-7c0cb22273e4, 2713f3dd-9000-4378-8f92-36c029d3dae3, 96ab1562-739a-4dac-8b68-982d788e10c9

事实：无

### P1 · 围绕非品牌采购问题补充选型说明

15 条可判定的非品牌回答没有品牌名称；先补充适用场景、参数限制和选择依据。

验收：产出一份含事实来源的选型内容，发布后使用原问题版本复测；不预设推荐提升。

问题：watch-keyword-058bb884e2e3e12f02113bfd, watch-keyword-532e310d54beebe2356227d4

样本：709486f7-b0c9-4c0a-87ba-5e897d236e23, 6d6ceff5-1d01-4ec4-9632-ec3f825def67, 5ab15ac9-aa9d-48ed-9e93-8cc13958e0f2, 4ebc113e-b3f7-4a98-96b2-0d9e0702dae0, 1c0fa6b5-f29f-44d1-8898-050b3a7c7cb6, a85cda5a-2526-4938-b13b-ad1aab33c1e8

事实：c-domain

### P1 · 核对来源类型和页面证据

目前有 3 个 Provider 引用项，12 个正文链接，二者需要分别核对。

验收：能返回原始来源路径，并人工确认页面是否支持对应声明；链接本身不证明已引用。

问题：无

样本：4924864f-0dab-4595-977c-afeeaecfb765, 709486f7-b0c9-4c0a-87ba-5e897d236e23, 5361fa95-e877-4424-8f25-cf4cb06786cc, dfbba462-d4b5-4144-8d69-96f8bc01d08f, c04a2dec-2c22-4b65-9268-220870e475ca

事实：无

## 内容草稿

已阻塞：目前只有观察域名，请补充并确认产品事实后再生成品牌内容。

## 复盘

本轮完成案例回放。计划 27 条，取得原文 27 条。可继续审核内容与执行任务。下一轮保持相同问题版本，分别记录发布动作和采样条件。本轮不提供优化效果的因果结论。

## 限制

- 推荐判定采用公开的文本规则，含品牌的回答需要人工复核语境。
- 引用项存在不证明来源正确，也不证明导致了推荐。
- 回答来自 2026-09-08 的上游公开归档，不代表当前模型表现。

## 执行记录

- brand-grounding / rules / completed：读取 1 项事实，0 项冲突，0 项待确认。
- query-discovery / rules / completed：采用问题集 v1，本轮 3 个问题。候选来自上游协议，不推断搜索量。
- visibility-audit / archive / completed：27 条样本，27 条有原文，24 条分析完成。仅回放原始数据，未调用模型。
- source-analysis / rules / completed：3 个 Provider 引用、0 个搜索结果、0 个 grounding 来源、12 个正文 URL；分别记录。
- strategy-planning / rules / completed：3 个任务。根据事实冲突、失败记录、品牌缺口与来源类型生成任务。
- content-engineering / rules / blocked：目前只有观察域名，请补充并确认产品事实后再生成品牌内容。
- monitoring-analysis / rules / completed：保留 3 个原始采样批次，按模型、品牌词与非品牌词分组。没有干预对照，不输出提升结论。
- experiment-retrospective / rules / completed：本轮完成案例回放。计划 27 条，取得原文 27 条。可继续审核内容与执行任务。下一轮保持相同问题版本，分别记录发布动作和采样条件。本轮不提供优化效果的因果结论。

## 原文与证据

### 4924864f-0dab-4595-977c-afeeaecfb765

问题：识别域名 posthog.com

模型：openai/gpt-4.1-mini · provider_native

观察时间：2026-09-08T06:05:33.040Z

状态：采集 completed；分析 completed

{"domainRecognition":"recognized","analysisStatus":"recognized","recognizedBrand":{"value":"PostHog","citationUrls":["https://posthog.com"]},"businessDescription":{"value":"PostHog is a product analytics and experimentation platform designed to help businesses understand user behavior and improve their products through data-driven insights. The platform offers features such as event tracking, session recording, and feature flags, enabling teams to analyze user interactions and optimize their applications effectively. With a focus on privacy and self-hosting options, PostHog empowers organizations to maintain control over their data while leveraging powerful analytics tools to drive growth and enhance user experience.","citationUrls":["https://posthog.com"]},"productCategory":{"value":"Product Analytics and Experimentation Platform","citationUrls":["https://posthog.com"]},"competitors":[{"name":"Mixpanel","domain":"mixpanel.com","businessDescription":"Mixpanel is a product analytics platform that helps businesses analyze user interactions and behaviors to make data-driven decisions. It offers features like event tracking, user segmentation, and A/B testing to optimize product experiences.","productCategory":"Product Analytics Platform","keywords":[{"keyword":"Product Analytics","citationUrls":["https://mixpanel.com"]},{"keyword":"User Behavior Analysis","citationUrls":["https://mixpanel.com"]},{"keyword":"A/B Testing","citationUrls":["https://mixpanel.com"]}],"citationUrls":["https://mixpanel.com"]},{"name":"Amplitude","domain":"amplitude.com","businessDescription":"Amplitude is a product analytics company that provides insights into user behavior to help businesses build better products. It offers tools for event tracking, user segmentation, and retention analysis to inform product decisions." ,"productCategory":"Product Analytics Platform","keywords":[{"keyword":"Product Analytics","citationUrls":["https://amplitude.com"]},{"keyword":"User Segmentation","citationUrls":["https://amplitude.com"]},{"keyword":"Retention Analysis","citationUrls":["https://amplitude.com"]}],"citationUrls":["https://amplitude.com"]}],"brandKeywords":[{"keyword":"Open Source","citationUrls":["https://posthog.com"]},{"keyword":"Self-Hosting","citationUrls":["https://posthog.com"]},{"keyword":"Privacy-Focused","citationUrls":["https://posthog.com"]}],"unknowns":[]}

来源：
- answer_url：https://posthog.com/；完整性 unverified
- answer_url：https://mixpanel.com/；完整性 unverified
- answer_url：https://amplitude.com/；完整性 unverified

### 709486f7-b0c9-4c0a-87ba-5e897d236e23

问题：Feature Flags

模型：openai/gpt-4.1-mini · provider_native

观察时间：2026-09-08T06:05:43.739Z

状态：采集 completed；分析 completed

{"analysisStatus":"completed","mentions":[{"name":"Feature Flags","domain":null,"recommendation":"mentioned","mentionQuote":"Feature flags are a powerful way to fine-tune your control over which features are enabled within a software deployment. ([splunk.com](https://www.splunk.com/en_us/blog/learn/feature-flags.html?utm_source=openai))","recommendationQuote":null,"firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"none"}],"unknowns":[]}

来源：
- provider_citation：https://www.splunk.com/en_us/blog/learn/feature-flags.html?utm_source=openai；完整性 matched
- answer_url：https://www.splunk.com/en_us/blog/learn/feature-flags.html?utm_source=openai；完整性 unverified

### d85e30b0-0dd7-46d9-900c-7c0cb22273e4

问题：Product Analytics

模型：openai/gpt-4.1-mini · provider_native

观察时间：2026-09-08T06:05:50.138Z

状态：采集 completed；分析 failed

{"analysisStatus":"completed","mentions":[{"name":"Pendo","domain":"pendo.io","recommendation":"positive","mentionQuote":"Pendo's analytics tool that instantly tracks what drives user engagement, retention, and product success—no manual event tagging needed.","recommendationQuote":"Pendo has been a huge win for us in this time when every dollar counts and efficiency is super important. It’s made collaboration more grounded in tangible objectives and results, and it provides metrics that define what ‘better’ really means.","firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"unique"},{"name":"Amplitude","domain":"amplitude.com","recommendation":"positive","mentionQuote":"Amplitude is a powerful product intelligence platform that will empower your product managers to self-serve and, in turn, allow you to make better and faster product decisions.","recommendationQuote":"Product intelligence is not simply reporting numbers. It’s about helping the business make measurably better decisions.","firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"unique"},{"name":"Whatfix","domain":"whatfix.com","recommendation":"positive","mentionQuote":"Whatfix Product Analytics goes beyond traditional dashboards by analyzing every user journey to reveal the ‘why’ behind the data. Pinpoint friction, fix issues faster, and deliver targeted in-app experiences that boost adoption and retention.","recommendationQuote":"Our Insights Agent analyzes user behavior and application events in real time, delivering clear explanations and tailored recommendations so your team can move faster, smarter, and with confidence.","firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"unique"},{"name":"Google Analytics","domain":"analytics.google.com","recommendation":"positive","mentionQuote":"Google Analytics is our overall pick for product analytics in 2026.","recommendationQuote":"Google Analytics is our #1 pick for product analytics for enterprises in 2026.","firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"unique"},{"name":"LogRocket","domain":"logrocket.com","recommendation":"positive","mentionQuote":"LogRocket is our overall pick for product analytics in 2026.","recommendationQuote":"LogRocket is our #1 pick for product analytics for enterprises in 2026.","firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"unique"},{"name":"Mixpanel","domain":"mixpanel.com","recommendation":"positive","mentionQuote":"Mixpanel is our overall pick for product analytics in 2026.","recommendationQuote":"Mixpanel is our #1 pick for product analytics for enterprises in 2026.","firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"unique"},{"name":"PostHog","domain":"posthog.com","recommendation":"positive","mentionQuote":"PostHog is our overall pick for product analytics in 2026.","recommendationQuote":"PostHog is our #1 pick for product analytics for enterprises in 2026.","firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"unique"},{"name":"Heap","domain":"heap.io","recommendation":"positive","mentionQuote":"Heap is our overall pick for product analytics in 2026.","recommendationQuote":"Heap is our #1 pick for product analytics for enterprises in 2026.","firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"unique"},{"name":"ChurnZero","domain":"churnzero.com","recommendation":"positive","mentionQuote":"ChurnZero is our overall pick for product analytics in 2026.","recommendationQuote":"ChurnZero is our #1 pick for product analytics for enterprises in 2026.","firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"unique"},{"name":"mParticle","domain":"mparticle.com","recommendation":"positive","mentionQuote":"mParticle is our overall pick for product analytics in 2026.","recommendationQuote":"mParticle is our #1 pick for product analytics for enterprises in 2026.","firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","

来源：
本次未返回来源项

### 374fe0ec-52f1-4f41-bada-a0f09c37409a

问题：识别域名 posthog.com

模型：openai/gpt-4o-mini · off

观察时间：2026-09-08T06:05:33.040Z

状态：采集 completed；分析 completed

{"domainRecognition":"recognized","analysisStatus":"recognized","recognizedBrand":{"value":"PostHog","citationUrls":[]},"businessDescription":{"value":"Product analytics platform","citationUrls":[]},"productCategory":{"value":"Analytics Software","citationUrls":[]},"competitors":[{"name":"Mixpanel","domain":"mixpanel.com","businessDescription":"Product analytics platform","productCategory":"Analytics Software","keywords":[{"keyword":"product analytics","citationUrls":[]},{"keyword":"user analytics","citationUrls":[]}],"citationUrls":[]},{"name":"Amplitude","domain":"amplitude.com","businessDescription":"Product analytics platform","productCategory":"Analytics Software","keywords":[{"keyword":"product analytics","citationUrls":[]},{"keyword":"user behavior analytics","citationUrls":[]}],"citationUrls":[]},{"name":"Heap","domain":"heap.io","businessDescription":"Product analytics platform","productCategory":"Analytics Software","keywords":[{"keyword":"event tracking","citationUrls":[]},{"keyword":"user analytics","citationUrls":[]}],"citationUrls":[]}],"brandKeywords":[{"keyword":"analytics","citationUrls":[]},{"keyword":"product analytics","citationUrls":[]},{"keyword":"user insights","citationUrls":[]}],"unknowns":[]}

来源：
本次未返回来源项

### 6d6ceff5-1d01-4ec4-9632-ec3f825def67

问题：Feature Flags

模型：openai/gpt-4o-mini · off

观察时间：2026-09-08T06:05:35.479Z

状态：采集 completed；分析 completed

{"analysisStatus":"completed","mentions":[{"name":"Feature Flags","domain":null,"recommendation":"mentioned","mentionQuote":"Feature Flags are a powerful tool for managing software features and deployments.","recommendationQuote":null,"firstMentionOffset":0,"firstRecommendationOffset":null,"firstMentionState":"unique","firstRecommendationState":"none"}],"unknowns":[]}

来源：
本次未返回来源项

### 5ab15ac9-aa9d-48ed-9e93-8cc13958e0f2

问题：Product Analytics

模型：openai/gpt-4o-mini · off

观察时间：2026-09-08T06:05:47.503Z

状态：采集 completed；分析 completed

{"analysisStatus":"completed","mentions":[{"name":"Product Analytics","domain":null,"recommendation":"mentioned","mentionQuote":"Product Analytics is a crucial aspect of understanding user behavior and improving product performance.","recommendationQuote":null,"firstMentionOffset":0,"firstRecommendationOffset":null,"firstMentionState":"unique","firstRecommendationState":"none"}],"unknowns":[]}

来源：
本次未返回来源项

### 5bc305f1-028b-4092-8673-26347ae5d9b5

问题：识别域名 posthog.com

模型：google/gemini-2.5-flash-lite · off

观察时间：2026-09-08T06:05:33.040Z

状态：采集 completed；分析 completed

{
  "domainRecognition": "recognized",
  "analysisStatus": "recognized",
  "recognizedBrand": {
    "value": "PostHog",
    "citationUrls": []
  },
  "businessDescription": {
    "value": "PostHog is an open-source product analytics platform that helps companies understand user behavior and improve their products. It offers features like event tracking, user segmentation, funnels, retention analysis, and feature flags.",
    "citationUrls": []
  },
  "productCategory": {
    "value": "Product Analytics",
    "citationUrls": []
  },
  "competitors": [
    {
      "name": "Amplitude",
      "domain": "amplitude.com",
      "businessDescription": "Amplitude is a product intelligence platform that helps companies understand user behavior, measure product performance, and make data-driven decisions.",
      "productCategory": "Product Analytics",
      "keywords": [
        {
          "keyword": "product analytics",
          "citationUrls": []
        },
        {
          "keyword": "user behavior",
          "citationUrls": []
        },
        {
          "keyword": "product intelligence",
          "citationUrls": []
        }
      ],
      "citationUrls": []
    },
    {
      "name": "Mixpanel",
      "domain": "mixpanel.com",
      "businessDescription": "Mixpanel is a product analytics platform that provides tools for understanding user behavior, tracking events, and analyzing product engagement.",
      "productCategory": "Product Analytics",
      "keywords": [
        {
          "keyword": "product analytics",
          "citationUrls": []
        },
        {
          "keyword": "user behavior",
          "citationUrls": []
        },
        {
          "keyword": "event tracking",
          "citationUrls": []
        }
      ],
      "citationUrls": []
    },
    {
      "name": "Heap",
      "domain": "heap.io",
      "businessDescription": "Heap is an event analytics platform that automatically captures user interactions, allowing businesses to analyze product usage and user behavior without manual instrumentation.",
      "productCategory": "Product Analytics",
      "keywords": [
        {
          "keyword": "product analytics",
          "citationUrls": []
        },
        {
          "keyword": "autocapture",
          "citationUrls": []
        },
        {
          "keyword": "user behavior",
          "citationUrls": []
        }
      ],
      "citationUrls": []
    }
  ],
  "brandKeywords": [
    {
      "keyword": "product analytics",
      "citationUrls": []
    },
    {
      "keyword": "open source",
      "citationUrls": []
    },
    {
      "keyword": "user behavior",
      "citationUrls": []
    },
    {
      "keyword": "feature flags",
      "citationUrls": []
    },
    {
      "keyword": "session replay",
      "citationUrls": []
    }
  ],
  "unknowns": []
}

来源：
本次未返回来源项

### 4ebc113e-b3f7-4a98-96b2-0d9e0702dae0

问题：Feature Flags

模型：google/gemini-2.5-flash-lite · off

观察时间：2026-09-08T06:05:46.397Z

状态：采集 completed；分析 completed

{
  "analysisStatus": "completed",
  "mentions": [
    {
      "name": "Feature Flags",
      "domain": null,
      "recommendation": "mentioned",
      "mentionQuote": "Feature Flags",
      "recommendationQuote": null,
      "firstMentionOffset": 0,
      "firstRecommendationOffset": null,
      "firstMentionState": "unique",
      "firstRecommendationState": "none"
    }
  ],
  "unknowns": []
}

来源：
本次未返回来源项

### 1c0fa6b5-f29f-44d1-8898-050b3a7c7cb6

问题：Product Analytics

模型：google/gemini-2.5-flash-lite · off

观察时间：2026-09-08T06:05:51.531Z

状态：采集 completed；分析 completed

{
  "analysisStatus": "completed",
  "mentions": [
    {
      "name": "Product Analytics",
      "domain": null,
      "recommendation": "mentioned",
      "mentionQuote": "Product Analytics",
      "recommendationQuote": null,
      "firstMentionOffset": 0,
      "firstRecommendationOffset": null,
      "firstMentionState": "unique",
      "firstRecommendationState": "none"
    }
  ],
  "unknowns": []
}

来源：
本次未返回来源项

### 048ceb56-7933-458a-9610-69c8f9932ab7

问题：识别域名 posthog.com

模型：openai/gpt-4o-mini · off

观察时间：2026-09-08T06:06:01.150Z

状态：采集 completed；分析 completed

{"domainRecognition":"recognized","analysisStatus":"recognized","recognizedBrand":{"value":"PostHog","citationUrls":[]},"businessDescription":{"value":"Product analytics platform","citationUrls":[]},"productCategory":{"value":"Analytics","citationUrls":[]},"competitors":[{"name":"Mixpanel","domain":"mixpanel.com","businessDescription":"Product analytics platform","productCategory":"Analytics","keywords":[{"keyword":"product analytics","citationUrls":[]},{"keyword":"user analytics","citationUrls":[]}],"citationUrls":[]},{"name":"Amplitude","domain":"amplitude.com","businessDescription":"Product analytics platform","productCategory":"Analytics","keywords":[{"keyword":"product analytics","citationUrls":[]},{"keyword":"user behavior analytics","citationUrls":[]}],"citationUrls":[]},{"name":"Heap","domain":"heap.io","businessDescription":"Product analytics platform","productCategory":"Analytics","keywords":[{"keyword":"product analytics","citationUrls":[]},{"keyword":"user behavior analytics","citationUrls":[]}],"citationUrls":[]}],"brandKeywords":[{"keyword":"analytics","citationUrls":[]},{"keyword":"product analytics","citationUrls":[]},{"keyword":"user behavior","citationUrls":[]}],"unknowns":[]}

来源：
本次未返回来源项

### a85cda5a-2526-4938-b13b-ad1aab33c1e8

问题：Feature Flags

模型：openai/gpt-4o-mini · off

观察时间：2026-09-08T06:06:03.272Z

状态：采集 completed；分析 completed

{"analysisStatus":"completed","mentions":[{"name":"Feature Flags","domain":null,"recommendation":"mentioned","mentionQuote":"Feature Flags are a powerful tool for managing software releases and enabling continuous delivery.","recommendationQuote":null,"firstMentionOffset":0,"firstRecommendationOffset":null,"firstMentionState":"unique","firstRecommendationState":"none"}],"unknowns":[]}

来源：
本次未返回来源项

### c7b9f38d-0d97-4a22-86b7-d7ddeba000a8

问题：Product Analytics

模型：openai/gpt-4o-mini · off

观察时间：2026-09-08T06:06:11.725Z

状态：采集 completed；分析 completed

{"analysisStatus":"completed","mentions":[{"name":"Product Analytics","domain":null,"recommendation":"mentioned","mentionQuote":"Product Analytics is a crucial aspect of understanding user behavior and improving product performance.","recommendationQuote":null,"firstMentionOffset":0,"firstRecommendationOffset":null,"firstMentionState":"unique","firstRecommendationState":"none"}],"unknowns":[]}

来源：
本次未返回来源项

### 98933c48-b6e8-40af-a28c-da5315557ff0

问题：识别域名 posthog.com

模型：google/gemini-2.5-flash-lite · off

观察时间：2026-09-08T06:06:01.150Z

状态：采集 completed；分析 completed

{
  "domainRecognition": "recognized",
  "analysisStatus": "recognized",
  "recognizedBrand": {
    "value": "PostHog",
    "citationUrls": []
  },
  "businessDescription": {
    "value": "PostHog is an open-source product analytics platform that helps companies understand user behavior and improve their products. It offers features like event tracking, user segmentation, funnels, retention analysis, and feature flags.",
    "citationUrls": []
  },
  "productCategory": {
    "value": "Product Analytics",
    "citationUrls": []
  },
  "competitors": [
    {
      "name": "Amplitude",
      "domain": "amplitude.com",
      "businessDescription": "Amplitude is a product intelligence platform that helps companies understand user behavior, measure product performance, and make data-driven decisions.",
      "productCategory": "Product Analytics",
      "keywords": [
        {
          "keyword": "product analytics",
          "citationUrls": []
        },
        {
          "keyword": "user behavior",
          "citationUrls": []
        },
        {
          "keyword": "product intelligence",
          "citationUrls": []
        }
      ],
      "citationUrls": []
    },
    {
      "name": "Mixpanel",
      "domain": "mixpanel.com",
      "businessDescription": "Mixpanel is a product analytics platform that provides tools for understanding user behavior, tracking events, and analyzing product engagement.",
      "productCategory": "Product Analytics",
      "keywords": [
        {
          "keyword": "product analytics",
          "citationUrls": []
        },
        {
          "keyword": "user behavior",
          "citationUrls": []
        },
        {
          "keyword": "event tracking",
          "citationUrls": []
        }
      ],
      "citationUrls": []
    },
    {
      "name": "Heap",
      "domain": "heap.io",
      "businessDescription": "Heap is an event analytics platform that automatically captures user interactions, allowing businesses to analyze product usage and user behavior without manual instrumentation.",
      "productCategory": "Product Analytics",
      "keywords": [
        {
          "keyword": "product analytics",
          "citationUrls": []
        },
        {
          "keyword": "autocapture",
          "citationUrls": []
        },
        {
          "keyword": "user behavior",
          "citationUrls": []
        }
      ],
      "citationUrls": []
    }
  ],
  "brandKeywords": [
    {
      "keyword": "product analytics",
      "citationUrls": []
    },
    {
      "keyword": "open source",
      "citationUrls": []
    },
    {
      "keyword": "user behavior",
      "citationUrls": []
    },
    {
      "keyword": "feature flags",
      "citationUrls": []
    },
    {
      "keyword": "session replay",
      "citationUrls": []
    }
  ],
  "unknowns": []
}

来源：
本次未返回来源项

### c1edcab9-f83b-42c8-b74b-e753a325284c

问题：Feature Flags

模型：google/gemini-2.5-flash-lite · off

观察时间：2026-09-08T06:06:10.644Z

状态：采集 completed；分析 completed

{
  "analysisStatus": "completed",
  "mentions": [
    {
      "name": "Feature Flags",
      "domain": null,
      "recommendation": "mentioned",
      "mentionQuote": "Feature Flags",
      "recommendationQuote": null,
      "firstMentionOffset": 0,
      "firstRecommendationOffset": null,
      "firstMentionState": "unique",
      "firstRecommendationState": "none"
    }
  ],
  "unknowns": []
}

来源：
本次未返回来源项

### 996c82f3-42df-4322-bd6a-252bc2f90ba4

问题：Product Analytics

模型：google/gemini-2.5-flash-lite · off

观察时间：2026-09-08T06:06:16.275Z

状态：采集 completed；分析 completed

{
  "analysisStatus": "completed",
  "mentions": [
    {
      "name": "Product Analytics",
      "domain": null,
      "recommendation": "mentioned",
      "mentionQuote": "Product Analytics",
      "recommendationQuote": null,
      "firstMentionOffset": 0,
      "firstRecommendationOffset": null,
      "firstMentionState": "unique",
      "firstRecommendationState": "none"
    }
  ],
  "unknowns": []
}

来源：
本次未返回来源项

### 5361fa95-e877-4424-8f25-cf4cb06786cc

问题：识别域名 posthog.com

模型：openai/gpt-4.1-mini · provider_native

观察时间：2026-09-08T06:06:01.151Z

状态：采集 completed；分析 completed

{"domainRecognition":"recognized","analysisStatus":"recognized","recognizedBrand":{"value":"PostHog","citationUrls":["https://posthog.com"]},"businessDescription":{"value":"PostHog is an open-source product analytics and session recording platform for software teams, offering self-hosted and cloud options. It is used primarily by product managers, engineers, growth, and data teams to track user behavior, feature usage, and funnels.","citationUrls":["https://posthog.com"]},"productCategory":{"value":"Product Analytics and Session Recording Platform","citationUrls":["https://posthog.com"]},"competitors":[{"name":"Mixpanel","domain":"mixpanel.com","businessDescription":"Mixpanel is a product analytics platform that helps businesses analyze user behavior and make data-driven decisions to improve their products.","productCategory":"Product Analytics Platform","keywords":[{"keyword":"Product Analytics","citationUrls":["https://mixpanel.com"]},{"keyword":"User Behavior Analysis","citationUrls":["https://mixpanel.com"]},{"keyword":"Data-Driven Decisions","citationUrls":["https://mixpanel.com"]}],"citationUrls":["https://mixpanel.com"]},{"name":"Amplitude","domain":"amplitude.com","businessDescription":"Amplitude is a product analytics platform that enables businesses to understand user behavior and build better products through data insights.","productCategory":"Product Analytics Platform","keywords":[{"keyword":"Product Analytics","citationUrls":["https://amplitude.com"]},{"keyword":"User Behavior Analysis","citationUrls":["https://amplitude.com"]},{"keyword":"Data Insights","citationUrls":["https://amplitude.com"]}],"citationUrls":["https://amplitude.com"]}],"brandKeywords":[{"keyword":"Open-Source","citationUrls":["https://posthog.com"]},{"keyword":"Self-Hosted","citationUrls":["https://posthog.com"]},{"keyword":"Product Analytics","citationUrls":["https://posthog.com"]},{"keyword":"Session Recording","citationUrls":["https://posthog.com"]}],"unknowns":[]}

来源：
- answer_url：https://posthog.com/；完整性 unverified
- answer_url：https://mixpanel.com/；完整性 unverified
- answer_url：https://amplitude.com/；完整性 unverified

### dfbba462-d4b5-4144-8d69-96f8bc01d08f

问题：Feature Flags

模型：openai/gpt-4.1-mini · provider_native

观察时间：2026-09-08T06:06:07.723Z

状态：采集 completed；分析 completed

{"analysisStatus":"completed","mentions":[{"name":"Feature Flags","domain":null,"recommendation":"mentioned","mentionQuote":"Feature flags are a powerful way to fine-tune your control over which features are enabled within a software deployment. ([splunk.com](https://www.splunk.com/en_us/blog/learn/feature-flags.html?utm_source=openai))","recommendationQuote":null,"firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"none"}],"unknowns":[]}

来源：
- provider_citation：https://www.splunk.com/en_us/blog/learn/feature-flags.html?utm_source=openai；完整性 matched
- answer_url：https://www.splunk.com/en_us/blog/learn/feature-flags.html?utm_source=openai；完整性 unverified

### 2713f3dd-9000-4378-8f92-36c029d3dae3

问题：Product Analytics

模型：openai/gpt-4.1-mini · provider_native

观察时间：2026-09-08T06:06:14.198Z

状态：采集 completed；分析 failed

{"analysisStatus":"completed","mentions":[{"name":"Pendo","domain":"pendo.io","recommendation":"positive","mentionQuote":"Pendo's analytics tool that instantly tracks what drives user engagement, retention, and product success—no manual event tagging needed.","recommendationQuote":"Pendo has been a huge win for us in this time when every dollar counts and efficiency is super important. It’s made collaboration more grounded in tangible objectives and results, and it provides metrics that define what ‘better’ really means.","firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"unique"},{"name":"Amplitude","domain":"amplitude.com","recommendation":"positive","mentionQuote":"Amplitude is a powerful product intelligence platform that will empower your product managers to self-serve and, in turn, allow you to make better and faster product decisions.","recommendationQuote":"Amplitude is a powerful product intelligence platform that will empower your product managers to self-serve and, in turn, allow you to make better and faster product decisions.","firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"unique"},{"name":"Mixpanel","domain":"mixpanel.com","recommendation":"positive","mentionQuote":"Mixpanel is a powerful product analytics tool that helps you convert, engage, and retain more users. Build funnels, see top user flows, create cohorts, and more with just a few clicks.","recommendationQuote":"Mixpanel is a powerful product analytics tool that helps you convert, engage, and retain more users. Build funnels, see top user flows, create cohorts, and more with just a few clicks.","firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"unique"},{"name":"PostHog","domain":"posthog.com","recommendation":"positive","mentionQuote":"PostHog is an open-source product analytics for developers. It helps engineers understand their product usage, automate events, and user data collection.","recommendationQuote":"PostHog is an open-source product analytics for developers. It helps engineers understand their product usage, automate events, and user data collection.","firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"unique"},{"name":"Heap","domain":"heap.io","recommendation":"positive","mentionQuote":"Heap is the only digital insights platform that gives you complete understanding of your customers’ digital journeys, so you can quickly improve conversion, retention, and customer delight.","recommendationQuote":"Heap is the only digital insights platform that gives you complete understanding of your customers’ digital journeys, so you can quickly improve conversion, retention, and customer delight.","firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"unique"},{"name":"LogRocket","domain":"logrocket.com","recommendation":"positive","mentionQuote":"LogRocket is a frontend monitoring and product analytics platform that combines high-fidelity session replay with technical telemetry to fix bugs and optimize UX.","recommendationQuote":"LogRocket is a frontend monitoring and product analytics platform that combines high-fidelity session replay with technical telemetry to fix bugs and optimize UX.","firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"unique"},{"name":"Whatfix","domain":"whatfix.com","recommendation":"positive","mentionQuote":"Whatfix Product Analytics goes beyond traditional dashboards by analyzing every user journey to reveal the ‘why’ behind the data. Pinpoint friction, fix issues faster, and deliver targeted in-app experiences that boost adoption and retention.","recommendationQuote":"Whatfix Product Analytics goes beyond traditional dashboards by analyzing every user journey to reveal the ‘why’ behind the data. Pinpoint friction, fix issues faster, and deliver targeted in-app experiences that boost adoption and retention.","firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"unique"},{"name":"Countly","domain":"count.ly","recommendation":"positive","mentionQuote":"Countly is an analytics platform to understand and enhance customer journeys in web, desktop and mobile applications. On-premise or in the Cloud.","recommendationQuote":"Countly is an analytics platform to understand and enhance customer journeys in web, desktop and mobile applications. On-premise or in the Cloud.","firstMentionOffset":

来源：
本次未返回来源项

### 5d447242-3122-42e7-9bfa-2f9c5363a8bd

问题：识别域名 posthog.com

模型：openai/gpt-4o-mini · off

观察时间：2026-09-08T06:07:00.013Z

状态：采集 completed；分析 completed

{"domainRecognition":"recognized","analysisStatus":"recognized","recognizedBrand":{"value":"PostHog","citationUrls":[]},"businessDescription":{"value":"Product analytics platform","citationUrls":[]},"productCategory":{"value":"Analytics","citationUrls":[]},"competitors":[{"name":"Mixpanel","domain":"mixpanel.com","businessDescription":"Product analytics platform","productCategory":"Analytics","keywords":[{"keyword":"product analytics","citationUrls":[]},{"keyword":"user analytics","citationUrls":[]}],"citationUrls":[]},{"name":"Amplitude","domain":"amplitude.com","businessDescription":"Product analytics platform","productCategory":"Analytics","keywords":[{"keyword":"product analytics","citationUrls":[]},{"keyword":"user behavior analytics","citationUrls":[]}],"citationUrls":[]},{"name":"Heap","domain":"heap.io","businessDescription":"Product analytics platform","productCategory":"Analytics","keywords":[{"keyword":"product analytics","citationUrls":[]},{"keyword":"user behavior analytics","citationUrls":[]}],"citationUrls":[]}],"brandKeywords":[{"keyword":"analytics","citationUrls":[]},{"keyword":"product analytics","citationUrls":[]},{"keyword":"user behavior","citationUrls":[]}],"unknowns":[]}

来源：
本次未返回来源项

### 56894622-d030-4778-bf3c-5a9b70cca4e5

问题：Feature Flags

模型：openai/gpt-4o-mini · off

观察时间：2026-09-08T06:07:08.722Z

状态：采集 completed；分析 completed

{"analysisStatus":"completed","mentions":[{"name":"Feature Flags","domain":null,"recommendation":"mentioned","mentionQuote":"Feature Flags are a powerful tool for managing software features and deployments.","recommendationQuote":null,"firstMentionOffset":0,"firstRecommendationOffset":null,"firstMentionState":"unique","firstRecommendationState":"none"}],"unknowns":[]}

来源：
本次未返回来源项

### 082d6c76-971c-4b96-abd9-10272232c88f

问题：Product Analytics

模型：openai/gpt-4o-mini · off

观察时间：2026-09-08T06:07:13.141Z

状态：采集 completed；分析 completed

{"analysisStatus":"completed","mentions":[{"name":"Product Analytics","domain":null,"recommendation":"mentioned","mentionQuote":"Product Analytics is a crucial aspect of understanding user behavior and improving product performance.","recommendationQuote":null,"firstMentionOffset":0,"firstRecommendationOffset":null,"firstMentionState":"unique","firstRecommendationState":"none"}],"unknowns":[]}

来源：
本次未返回来源项

### 4bd9b598-3650-45ad-a669-03dbe6b55df4

问题：识别域名 posthog.com

模型：google/gemini-2.5-flash-lite · off

观察时间：2026-09-08T06:07:00.012Z

状态：采集 completed；分析 completed

{
  "domainRecognition": "recognized",
  "analysisStatus": "recognized",
  "recognizedBrand": {
    "value": "PostHog",
    "citationUrls": []
  },
  "businessDescription": {
    "value": "PostHog is an open-source product analytics platform that helps companies understand user behavior and improve their products. It offers features like event tracking, user segmentation, funnels, retention analysis, and feature flags.",
    "citationUrls": []
  },
  "productCategory": {
    "value": "Product Analytics",
    "citationUrls": []
  },
  "competitors": [
    {
      "name": "Amplitude",
      "domain": "amplitude.com",
      "businessDescription": "Amplitude is a product intelligence platform that helps companies understand user behavior, measure product performance, and make data-driven decisions.",
      "productCategory": "Product Analytics",
      "keywords": [
        {
          "keyword": "product analytics",
          "citationUrls": []
        },
        {
          "keyword": "user behavior",
          "citationUrls": []
        },
        {
          "keyword": "product intelligence",
          "citationUrls": []
        }
      ],
      "citationUrls": []
    },
    {
      "name": "Mixpanel",
      "domain": "mixpanel.com",
      "businessDescription": "Mixpanel is a product analytics platform that provides tools for understanding user behavior, tracking events, and analyzing product engagement.",
      "productCategory": "Product Analytics",
      "keywords": [
        {
          "keyword": "product analytics",
          "citationUrls": []
        },
        {
          "keyword": "user behavior",
          "citationUrls": []
        },
        {
          "keyword": "event tracking",
          "citationUrls": []
        }
      ],
      "citationUrls": []
    },
    {
      "name": "Heap",
      "domain": "heap.io",
      "businessDescription": "Heap is an event analytics platform that automatically captures user interactions, allowing businesses to analyze product usage and user behavior without manual instrumentation.",
      "productCategory": "Product Analytics",
      "keywords": [
        {
          "keyword": "product analytics",
          "citationUrls": []
        },
        {
          "keyword": "autocapture",
          "citationUrls": []
        },
        {
          "keyword": "user behavior",
          "citationUrls": []
        }
      ],
      "citationUrls": []
    }
  ],
  "brandKeywords": [
    {
      "keyword": "product analytics",
      "citationUrls": []
    },
    {
      "keyword": "open source",
      "citationUrls": []
    },
    {
      "keyword": "user behavior",
      "citationUrls": []
    },
    {
      "keyword": "feature flags",
      "citationUrls": []
    },
    {
      "keyword": "session replay",
      "citationUrls": []
    }
  ],
  "unknowns": []
}

来源：
本次未返回来源项

### ec46bc50-687c-43c0-a2a6-6743bf216885

问题：Feature Flags

模型：google/gemini-2.5-flash-lite · off

观察时间：2026-09-08T06:07:02.778Z

状态：采集 completed；分析 completed

{
  "analysisStatus": "completed",
  "mentions": [
    {
      "name": "Feature Flags",
      "domain": null,
      "recommendation": "mentioned",
      "mentionQuote": "Feature Flags",
      "recommendationQuote": null,
      "firstMentionOffset": 0,
      "firstRecommendationOffset": null,
      "firstMentionState": "unique",
      "firstRecommendationState": "none"
    }
  ],
  "unknowns": []
}

来源：
本次未返回来源项

### 9dfc6241-3c2b-437d-a8b0-9f0557bc501e

问题：Product Analytics

模型：google/gemini-2.5-flash-lite · off

观察时间：2026-09-08T06:07:09.628Z

状态：采集 completed；分析 completed

{
  "analysisStatus": "completed",
  "mentions": [
    {
      "name": "Product Analytics",
      "domain": null,
      "recommendation": "mentioned",
      "mentionQuote": "Product Analytics",
      "recommendationQuote": null,
      "firstMentionOffset": 0,
      "firstRecommendationOffset": null,
      "firstMentionState": "unique",
      "firstRecommendationState": "none"
    }
  ],
  "unknowns": []
}

来源：
本次未返回来源项

### c04a2dec-2c22-4b65-9268-220870e475ca

问题：识别域名 posthog.com

模型：openai/gpt-4.1-mini · provider_native

观察时间：2026-09-08T06:07:00.013Z

状态：采集 completed；分析 completed

{"domainRecognition":"recognized","analysisStatus":"recognized","recognizedBrand":{"value":"PostHog","citationUrls":["https://posthog.com"]},"businessDescription":{"value":"PostHog is an open-source product analytics and session recording platform for software teams, offering self-hosted and cloud options. It is used primarily by product managers, engineers, growth, and data teams to track user behavior, feature usage, and funnels.","citationUrls":["https://posthog.com"]},"productCategory":{"value":"Product Analytics and Session Recording Platform","citationUrls":["https://posthog.com"]},"competitors":[{"name":"Mixpanel","domain":"mixpanel.com","businessDescription":"Mixpanel is a product analytics platform that helps businesses analyze user interactions and behaviors to improve product decisions.","productCategory":"Product Analytics Platform","keywords":[{"keyword":"Product Analytics","citationUrls":["https://mixpanel.com"]},{"keyword":"User Behavior Analysis","citationUrls":["https://mixpanel.com"]}],"citationUrls":["https://mixpanel.com"]},{"name":"Amplitude","domain":"amplitude.com","businessDescription":"Amplitude is a product analytics company that provides insights into user behavior to help teams build better products.","productCategory":"Product Analytics Platform","keywords":[{"keyword":"Product Analytics","citationUrls":["https://amplitude.com"]},{"keyword":"User Behavior Insights","citationUrls":["https://amplitude.com"]}],"citationUrls":["https://amplitude.com"]}],"brandKeywords":[{"keyword":"Open-Source","citationUrls":["https://posthog.com"]},{"keyword":"Self-Hosted","citationUrls":["https://posthog.com"]},{"keyword":"Session Recording","citationUrls":["https://posthog.com"]}],"unknowns":[]}

来源：
- answer_url：https://posthog.com/；完整性 unverified
- answer_url：https://mixpanel.com/；完整性 unverified
- answer_url：https://amplitude.com/；完整性 unverified

### 87e02919-a3e5-42ce-b2da-bae153456de0

问题：Feature Flags

模型：openai/gpt-4.1-mini · provider_native

观察时间：2026-09-08T06:07:06.429Z

状态：采集 completed；分析 completed

{"analysisStatus":"completed","mentions":[{"name":"Feature Flags","domain":null,"recommendation":"mentioned","mentionQuote":"Feature flags are a runtime switch in code that turns a piece of functionality on or off without redeploying. ([glossary.deployment.to](https://glossary.deployment.to/feature-flag/?utm_source=openai))","recommendationQuote":null,"firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"none"}],"unknowns":[]}

来源：
- provider_citation：https://glossary.deployment.to/feature-flag/?utm_source=openai；完整性 matched
- answer_url：https://glossary.deployment.to/feature-flag/?utm_source=openai；完整性 unverified

### 96ab1562-739a-4dac-8b68-982d788e10c9

问题：Product Analytics

模型：openai/gpt-4.1-mini · provider_native

观察时间：2026-09-08T06:07:12.056Z

状态：采集 completed；分析 failed

{"analysisStatus":"completed","mentions":[{"name":"Pendo","domain":"pendo.io","recommendation":"positive","mentionQuote":"Pendo's analytics tool that instantly tracks what drives user engagement, retention, and product success—no manual event tagging needed.","recommendationQuote":"Pendo has been a huge win for us in this time when every dollar counts and efficiency is super important. It’s made collaboration more grounded in tangible objectives and results, and it provides metrics that define what ‘better’ really means.","firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"unique"},{"name":"Google Analytics","domain":"analytics.google.com","recommendation":"positive","mentionQuote":"Google Analytics is our overall pick for product analytics in 2026.","recommendationQuote":"Google Analytics is our overall pick for product analytics in 2026.","firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"unique"},{"name":"Firebase Analytics","domain":"firebase.google.com/products/analytics","recommendation":"positive","mentionQuote":"Firebase Analytics is our free pick for product analytics in 2026.","recommendationQuote":"Firebase Analytics is our free pick for product analytics in 2026.","firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"unique"},{"name":"Amplitude","domain":"amplitude.com","recommendation":"positive","mentionQuote":"Amplitude is a powerful product intelligence platform that will empower your product managers to self-serve and, in turn, allow you to make better and faster product decisions.","recommendationQuote":"Amplitude is a powerful product intelligence platform that will empower your product managers to self-serve and, in turn, allow you to make better and faster product decisions.","firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"unique"},{"name":"Mixpanel","domain":"mixpanel.com","recommendation":"positive","mentionQuote":"Mixpanel is our solid pick for product analytics in 2026.","recommendationQuote":"Mixpanel is our solid pick for product analytics in 2026.","firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"unique"},{"name":"PostHog","domain":"posthog.com","recommendation":"positive","mentionQuote":"PostHog is our solid pick for product analytics in 2026.","recommendationQuote":"PostHog is our solid pick for product analytics in 2026.","firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"unique"},{"name":"LogRocket","domain":"logrocket.com","recommendation":"positive","mentionQuote":"LogRocket is our most affordable pick for product analytics in 2026.","recommendationQuote":"LogRocket is our most affordable pick for product analytics in 2026.","firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"unique"},{"name":"ChurnZero","domain":"churnzero.com","recommendation":"positive","mentionQuote":"ChurnZero is our community favorite pick for product analytics in 2026.","recommendationQuote":"ChurnZero is our community favorite pick for product analytics in 2026.","firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"unique"},{"name":"mParticle","domain":"www.mparticle.com","recommendation":"positive","mentionQuote":"mParticle is a product analytics platform that connects directly to your data warehouse to provide actionable insights across the entire customer journey.","recommendationQuote":"mParticle is a product analytics platform that connects directly to your data warehouse to provide actionable insights across the entire customer journey.","firstMentionOffset":0,"firstRecommendationOffset":0,"firstMentionState":"unique","firstRecommendationState":"unique"},{"name":"Heap","domain":"heap.io","recommendation":"positive","mentionQuote":"Heap is the only digital insights platform that gives you complete understanding of your customers’ digital journeys, so you can quickly improve conversion, retention, and customer delight.","recommendationQuote":"Heap is the only digital insights platform that gives you complete understanding of your customers’ digital journeys, so you can quickly improve conversion, retention, and customer delight.","firstMentionOffset":0,"firstRecommendationOffset

来源：
本次未返回来源项

