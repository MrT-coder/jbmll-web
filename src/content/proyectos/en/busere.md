---
titulo: BUSERE, a multi-test psychological assessment platform
desc: Psychologists create their own tests, deliver them by link to respondents without an account, and download the report as a PDF.
estado: construyendo
contexto: personal
fecha: 2026-04
destacado: false
st:
  - Java
  - Spring Boot
  - Spring Modulith
  - PostgreSQL
  - Testcontainers
  - Playwright
  - Nuxt
  - Vue.js
  - TypeScript
  - Tailwind CSS
  - Vitest
  - Astro
  - Docker
  - Cloudflare
  - GitHub Actions
kw:
  - psychological assessment
  - modular monolith
  - hexagonal architecture
  - data encryption
  - data privacy
  - PDF report generation
  - credit system
demo: https://busere.com
borrador: false
cv:
  - Built a platform where psychologists design their own tests, deliver them by link to respondents without an account, and download the report as a PDF.
  - Developed the API in Java 25 and Spring Boot 4 as a modular monolith with Spring Modulith and hexagonal architecture, with module boundaries verified by tests.
  - Encrypted respondent answers with AES-256-GCM and key rotation, and purged them after the report was downloaded.
  - Implemented custom authentication with HttpOnly cookies, CSRF and Argon2, and PDF reports with Thymeleaf and headless Chromium.
---

I built BUSERE, a platform where each psychologist designs their own psychological tests and uses them with their respondents. The system ships with no preloaded tests: the psychologist builds theirs by sections, each with its items, scale, scoring and categories. Then they send a link to the respondent, who answers it without creating an account, and download the report as a PDF. Tests are private to their author. The product site is at [busere.com](https://busere.com).

![List of the psychologist's tests, with a sample test published and its price per assessment](/media/busere-tests.webp "The psychologist creates their tests and publishes them to use in their links.")

## Prepaid credits, no commissions

The psychologist pays for each administration with prepaid credits, with no monthly fees, and freely sets what they charge their respondents: the platform takes no commission. Creating a link reserves one credit, which is consumed only when the report is delivered; if it is not delivered, it returns to the balance. Top-ups are made by bank transfer and approved by the administrator.

## Modular monolith with verified boundaries

I wrote the API in Java 25 with Spring Boot 4 and Spring Modulith, with hexagonal architecture inside each module: identity, tests, links, credits, top-ups and reports, among others. The boundaries between modules are checked by tests, so the design does not degrade over time. The suite has 351 unit test classes and 126 integration test classes running against a real PostgreSQL with Testcontainers.

## Respondent data: encrypted and ephemeral

Respondents' answers are stored encrypted with AES-256-GCM, with key rotation, and are purged after the report is downloaded. The AI model that drafts part of the report receives only scores, categories and age, never the name, national ID number or contact details. I reviewed the design against Ecuador's Organic Law on Personal Data Protection.

## Custom authentication instead of an external provider

I implemented sessions with an HttpOnly cookie, a CSRF header and Argon2 passwords. Login has an attempt limit that does not lock the account and does not reveal which emails are registered. For a product with few roles, it spared me from operating a separate identity server.

## PDF reports with Chromium

I generate the reports from Thymeleaf templates rendered in headless Chromium, with the charts as SVG inside the document. I ruled out JasperReports so I could design the report with HTML and CSS. The generation jobs use a queue on PostgreSQL instead of Redis, one less piece of infrastructure.

![Results report for a sample test, with a score table by scale, a graphical profile and an interpretation](/media/busere-informe.webp "Report for a sample assessment, as downloaded in PDF.")

## Frontend and public site

The dashboard is a Nuxt 4 SPA split into layers by business area, with 194 test files in Vitest. Route guards exist only for user experience: authorization is decided by the API. The public site, built with Astro, is published on Cloudflare Pages.
