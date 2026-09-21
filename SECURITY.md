# Security

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue.

Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository (Security → Report a vulnerability). I will acknowledge within a few days.

## What is worth reporting

This repository is the source of a live iOS app backed by a Supabase project and a small Express
service. The most valuable reports are about the boundary between them:

- **Row-level security gaps** — any path where one account can read or write another's rows.
  `supabase/schema.sql` is the whole data model, and `supabase/__tests__/schema.test.ts` asserts
  isolation from the perspective of two signed-in users. A case those tests miss is a real bug.
- **Authentication bypass on the backend** — every route that costs money or touches an account
  verifies a Supabase bearer token in `backend/supabase-auth.ts` and rate-limits per user. A way
  around either matters.
- **Input reaching a provider unvalidated** — the proxies in `backend/` exist so that API keys
  stay server-side; anything that turns them into an open relay is in scope.

## What is not a vulnerability

- **The Supabase URL and publishable key appearing in the client.** They are designed to be
  public, and every table has row-level security. A *missing* policy is a vulnerability; the key
  being visible is not.
- **The absence of a server for the app you built yourself.** The hosted backend is not open for
  general use, and its origin is not published here. Run your own; see the README.
- **Estimated figures being imprecise.** Step counts derived from stride length and values read
  by OCR are labelled as estimates throughout, by design.

## Handling your own deployment

If you run this yourself, note that `SUPABASE_SERVICE_ROLE_KEY` bypasses row-level security
entirely. It belongs only in the backend's server environment — never in `EXPO_PUBLIC_*`, never
in the mobile bundle, and never in a commit.
