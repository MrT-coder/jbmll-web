---
titulo: Corporate website and self-managed CMS for a law firm
desc: Full-stack platform that non-technical staff manage without touching code.
estado: produccion
fecha: 2025-01
destacado: true
st:
  - PHP
  - Laravel
  - Filament
  - Inertia.js
  - React
  - TypeScript
  - Tailwind CSS
  - PostgreSQL
  - Docker
  - GitHub Actions
  - Pest
  - Vitest
  - Cloudflare
kw:
  - CMS
  - RBAC
  - CI/CD
  - hardening
  - SSR
cv:
  - Designed and built a corporate website and self-managed CMS with Laravel, Filament, Inertia.js, React and TypeScript, live in production.
  - Implemented role-based access control with per-model policies.
  - Hardened the contact form with Turnstile, rate limiting, CSRF, restricted CORS origins and CSP, HSTS and Permissions-Policy headers.
  - Set up a GitHub Actions CI/CD pipeline with a 148-test suite as a merge gate that publishes a container image.
---

I designed and built a full-stack corporate platform with an admin panel that
lets non-technical staff manage every public section —services, publications,
achievements, team, branches and site identity— without developer involvement.

## Access

I implemented role-based access control with per-model policies, so each profile
reaches only the content that corresponds to it.

## The public site

I built it as a server-driven SPA with Inertia.js, React and TypeScript, with
server-side rendering support.

## Hardening the contact form

A public form is the cheapest door for abusing a site. I locked it down with
Turnstile verification, rate limiting, CSRF, restricted CORS origins, encrypted
sessions with secure cookies, and CSP, HSTS and Permissions-Policy headers.

## Images

I automated asset handling with an upload component that converts and compresses
to WebP, reducing page weight without manual work.

## Integration and deployment

I configured a continuous integration pipeline with static checks and a
148-test suite as a merge condition, which builds and publishes a container
image. The server never builds: it only pulls the already-built image.

I deployed two environments, integration and production, with a PostgreSQL
database, a dedicated container for the job queue and automatic migrations at
startup.

The integration environment is not indexable, and that is decided with an
explicit environment flag rather than inferred from the environment's name.
Inferring it is exactly how a test site ends up competing with the production one
in search engines.

## Maps

I replaced the paid map picker with one based on Leaflet and OpenStreetMap, which
needs no API key. It removed a recurring cost and, with it, a key to manage and
one that could leak.
