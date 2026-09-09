# CountryMatcher

CountryMatcher is a production immigration eligibility matching product for Russian citizens comparing relocation options.

A user completes one profile questionnaire, and the application evaluates that profile against structured country and migration-route requirements using one generic matching engine.

- **Live product:** https://sankhipkate.github.io/countrymatcher/
- **Detailed technical documentation:** [countrymatcher/README.md](countrymatcher/README.md)
- **QA case study:** https://github.com/SankhipKate/qa-portfolio/blob/main/case-studies/countrymatcher-production-qa.md

## Why This Project Matters

The main engineering and QA challenge is scale without country-specific logic turning into a collection of hard-coded exceptions.

CountryMatcher separates:

1. **Country facts and requirements** into structured Research Package data.
2. **Matching behavior** into one generic Canon 4.0 engine.
3. **Presentation behavior** into shared UI and funnel logic.
4. **Validation and release confidence** into schemas, integrity checks, automated tests, and one canonical verifier.

This makes new country packages testable against shared contracts and reduces regression risk as coverage grows.

## QA & Engineering Focus

The project demonstrates:

- requirements analysis and Shift-Left QA;
- complex business-rule testing;
- schema and data-integrity validation;
- API/backend-style state and contract thinking;
- negative and edge-case analysis;
- cross-country regression design;
- automated testing;
- CI/CD release gates;
- production release verification;
- AI-assisted requirements analysis, edge-case discovery, test generation, code review, and data validation.

Final product rules and release decisions remain explicit and testable in the repository.

## Architecture at a Glance

- `countrymatcher/` — production application deployed through GitHub Pages;
- `countrymatcher/data/` — structured country Research Packages and shared data;
- `countrymatcher/js/engine/rp4-engine.js` — generic Research Package 4.0 evaluator;
- `countrymatcher/tests/` — automated coverage for engine, country packages, profile, funnel, access flow, and UI behavior;
- `source-documents/canon-v4.0/` — active research and matching standards;
- `verify` — repository-level canonical release gate.

For the full runtime contract, data model, architecture, access flow, and testing details, see [countrymatcher/README.md](countrymatcher/README.md).

## Testing and Release

The canonical verification command is:

```bash
bash ./verify
```

The same root verifier is used locally and in GitHub Actions. It coordinates package validation, automated tests, JavaScript syntax checks, dependency setup, and repository-specific release checks.

## Production Snapshot

At version `19.0.1`, CountryMatcher has **19 active countries** in production, all evaluated through the shared generic engine.

The current production version is tracked in [`countrymatcher/VERSION`](countrymatcher/VERSION), and the active-country list is maintained in the detailed project README.

## Portfolio Context

CountryMatcher is included in my QA portfolio not simply as a website, but as evidence of production QA work: turning ambiguous requirements into explicit rules, designing reusable validation, protecting shared behavior with regression coverage, and maintaining release confidence as product scope grows.
