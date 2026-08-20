#!/usr/bin/env python3
"""Country Matcher Research Package 4.0 validator.

One command performs:
1. JSON Schema Draft 2020-12 validation.
2. Cross-reference and cross-object integrity validation.

Usage:
    python countrymatcher/data/validate.py path/to/XX-research-v4.0.json

Exit code 0 = both stages passed; 1 = validation errors; 2 = usage/read/dependency error.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Iterable

REQUIRED_CITY_ROLES = {"CAPITAL", "LARGE", "MEDIUM", "SMALL"}
FINAL_CANON_REVISION = "2026-08-08-final-lock"


def load_active_engine_financial_capabilities() -> dict[str, list[str]]:
    engine_path = Path(__file__).resolve().parents[1] / "js" / "engine" / "rp4-engine.js"
    script = """
import { pathToFileURL } from 'node:url';
const engine = await import(pathToFileURL(process.argv[1]).href);
process.stdout.write(JSON.stringify(engine.ACTIVE_ENGINE_FINANCIAL_CAPABILITIES));
"""
    try:
        result = subprocess.run(
            ["node", "--input-type=module", "--eval", script, str(engine_path)],
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError as exc:
        raise RuntimeError(f"Cannot load active ENGINE financial capabilities from {engine_path}: {exc}") from exc
    if result.returncode != 0:
        detail = result.stderr.strip() or f"Node exited with status {result.returncode}"
        raise RuntimeError(f"Cannot load active ENGINE financial capabilities from {engine_path}: {detail}")
    try:
        capabilities = json.loads(result.stdout)
    except Exception as exc:
        raise RuntimeError(f"Invalid active ENGINE financial capability export from {engine_path}: {exc}") from exc
    if not isinstance(capabilities, dict) or any(
        not isinstance(capabilities.get(key), list)
        or not all(isinstance(value, str) for value in capabilities[key])
        for key in ("models", "alternativeKinds", "comparisons")
    ):
        raise RuntimeError(f"Invalid active ENGINE financial capability shape from {engine_path}")
    return capabilities


ACTIVE_ENGINE_FINANCIAL_CAPABILITIES = load_active_engine_financial_capabilities()


def fail(message: str, errors: list[str]) -> None:
    errors.append(message)


def duplicates(values: Iterable[str]) -> set[str]:
    seen: set[str] = set()
    dup: set[str] = set()
    for value in values:
        if value in seen:
            dup.add(value)
        seen.add(value)
    return dup


def walk_source_refs(value: Any, path: str = "$"):
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            if key == "official_source_id" and isinstance(child, str):
                yield child_path, child
            elif key == "source_ids" or key.endswith("_source_ids"):
                if isinstance(child, list):
                    for i, source_id in enumerate(child):
                        if isinstance(source_id, str):
                            yield f"{child_path}[{i}]", source_id
            else:
                yield from walk_source_refs(child, child_path)
    elif isinstance(value, list):
        for i, child in enumerate(value):
            yield from walk_source_refs(child, f"{path}[{i}]")


def validate_schema(data: dict[str, Any]) -> list[str]:
    try:
        from jsonschema import Draft202012Validator, FormatChecker
    except ImportError as exc:
        raise RuntimeError(
            "Python package 'jsonschema' is required. Install it with: python -m pip install jsonschema"
        ) from exc

    schema_path = Path(__file__).with_name("research-package-v4.0.schema.json")
    try:
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise RuntimeError(f"Cannot read schema {schema_path}: {exc}") from exc

    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors = sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path))

    result: list[str] = []
    for error in errors:
        path = "$"
        for part in error.absolute_path:
            path += f"[{part}]" if isinstance(part, int) else f".{part}"
        result.append(f"{path}: {error.message}")
    return result


def validate_integrity(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []

    sources = data.get("sources", [])
    routes = data.get("routes", [])
    cities = data.get("cities", [])
    open_items = data.get("open_items", [])

    if data.get("schema_version") != "4.0":
        fail(f"$.schema_version: expected 4.0, got {data.get('schema_version')!r}", errors)
    if data.get("canon_revision") != FINAL_CANON_REVISION:
        fail(
            f"$.canon_revision: superseded/incompatible 4.0 draft; expected {FINAL_CANON_REVISION}",
            errors,
        )

    source_ids = [x.get("source_id") for x in sources if isinstance(x, dict) and isinstance(x.get("source_id"), str)]
    route_ids = [x.get("route_id") for x in routes if isinstance(x, dict) and isinstance(x.get("route_id"), str)]
    city_ids = [x.get("city_id") for x in cities if isinstance(x, dict) and isinstance(x.get("city_id"), str)]
    open_item_ids = [x.get("item_id") for x in open_items if isinstance(x, dict) and isinstance(x.get("item_id"), str)]

    for label, values in [
        ("source_id", source_ids),
        ("route_id", route_ids),
        ("city_id", city_ids),
        ("open_item_id", open_item_ids),
    ]:
        for value in sorted(duplicates(values)):
            fail(f"duplicate {label}: {value}", errors)

    source_set = set(source_ids)
    route_map = {x["route_id"]: x for x in routes if isinstance(x, dict) and isinstance(x.get("route_id"), str)}
    route_set = set(route_map)
    city_set = set(city_ids)
    open_item_map = {x["item_id"]: x for x in open_items if isinstance(x, dict) and isinstance(x.get("item_id"), str)}
    open_item_set = set(open_item_map)

    route_blocking_items = [
        item for item in open_items
        if isinstance(item, dict)
        and item.get("blocks_publication") is True
        and isinstance(item.get("related_route_id"), str)
    ]
    country_blocking_items = [
        item for item in open_items
        if isinstance(item, dict)
        and item.get("blocks_publication") is True
        and item.get("related_route_id") is None
    ]

    # Every source reference resolves.
    for path, source_id in walk_source_refs(data):
        if source_id not in source_set:
            fail(f"{path}: unknown source_id {source_id}", errors)

    # Route coverage links resolve and are compatible with covers_categories.
    linked_routes_seen: set[str] = set()
    coverage_links: dict[str, set[str]] = {}

    for i, item in enumerate(data.get("route_coverage", [])):
        if not isinstance(item, dict):
            continue
        category = item.get("category")
        result = item.get("result")
        linked = item.get("linked_route_ids") or []

        if isinstance(category, str):
            coverage_links.setdefault(category, set()).update(
                route_id for route_id in linked if isinstance(route_id, str)
            )

        if result != "ROUTE_EXISTS" and linked:
            fail(f"$.route_coverage[{i}]: {result} must not carry linked_route_ids", errors)

        for route_id in linked:
            if route_id not in route_set:
                fail(f"$.route_coverage[{i}].linked_route_ids: unknown route_id {route_id}", errors)
                continue
            linked_routes_seen.add(route_id)
            covers = route_map[route_id].get("covers_categories") or []
            if category not in covers:
                fail(
                    f"$.route_coverage[{i}]: route {route_id} does not cover category={category}; "
                    f"covers_categories={covers}",
                    errors,
                )

    for route_id, route in route_map.items():
        covers = route.get("covers_categories") or []
        route_type = route.get("route_type")

        if route_type not in covers:
            fail(
                f"$.routes[{route_id}]: route_type={route_type} must be included in covers_categories={covers}",
                errors,
            )

        if route_id not in linked_routes_seen:
            fail(f"$.routes[{route_id}]: route is not linked from route_coverage", errors)

        for category in covers:
            if route_id not in coverage_links.get(category, set()):
                fail(
                    f"$.routes[{route_id}].covers_categories: category {category} does not link back "
                    f"to route {route_id} in route_coverage",
                    errors,
                )

        for j, scenario in enumerate(route.get("family_scenarios", [])):
            if not isinstance(scenario, dict):
                continue
            linked = scenario.get("linked_route_id")
            if linked is not None and linked not in route_set:
                fail(
                    f"$.routes[{route_id}].family_scenarios[{j}].linked_route_id: unknown route_id {linked}",
                    errors,
                )

            # MVP family completeness. Same-route simultaneous family may inherit the
            # route long_term_path. Delayed/separate family must have either a linked
            # route or its own member_long_term_path. Explicit NOT_RESEARCHED is a
            # research blocker, never a user blocker.
            simultaneous = scenario.get("simultaneous_move")
            join_stage = scenario.get("join_stage")
            separate = scenario.get("separate_route_required")
            member_path = scenario.get("member_long_term_path")
            family_unresolved = simultaneous == "NOT_RESEARCHED" or join_stage == "NOT_RESEARCHED"
            separate_path = join_stage == "SEPARATE_ROUTE" or separate is True
            if route.get("publishable") is True and family_unresolved:
                fail(
                    f"$.routes[{route_id}].family_scenarios[{j}]: publishable route has NOT_RESEARCHED family applicability",
                    errors,
                )
            if route.get("publishable") is True and separate_path and linked is None and member_path is None:
                fail(
                    f"$.routes[{route_id}].family_scenarios[{j}]: separate family path requires linked_route_id or member_long_term_path",
                    errors,
                )

        if route.get("publishable") is True:
            geographic_methods = [
                method for method in (route.get("application_methods") or [])
                if isinstance(method, dict) and method.get("method") != "ONLINE"
            ]
            usable_geographic_methods = [
                method for method in geographic_methods
                if method.get("availability") in {"AVAILABLE", "CONDITIONAL"}
            ]
            if not usable_geographic_methods:
                fail(
                    f"$.routes[{route_id}].application_methods: publishable route requires at least one "
                    "researched AVAILABLE/CONDITIONAL geographic method; ONLINE alone is not a filing place",
                    errors,
                )

            for k, requirement in enumerate(route.get("requirements") or []):
                if not isinstance(requirement, dict):
                    continue
                mode = requirement.get("evaluation_mode")
                rtype = requirement.get("type")
                if mode == "ENGINE" and rtype == "FINANCIAL":
                    requirement_id = requirement.get("requirement_id")
                    financial = requirement.get("financial") or {}
                    model = financial.get("model")
                    if model not in ACTIVE_ENGINE_FINANCIAL_CAPABILITIES["models"]:
                        fail(
                            f"$.routes[{route_id}].requirements[{requirement_id}].financial.model: "
                            f"unsupported active ENGINE financial model {model}",
                            errors,
                        )
                    for alternative_index, alternative in enumerate(financial.get("alternatives") or []):
                        if not isinstance(alternative, dict):
                            continue
                        kind = alternative.get("kind")
                        comparison = alternative.get("comparison")
                        alternative_path = (
                            f"$.routes[{route_id}].requirements[{requirement_id}].financial."
                            f"alternatives[{alternative_index}]"
                        )
                        if kind not in ACTIVE_ENGINE_FINANCIAL_CAPABILITIES["alternativeKinds"]:
                            fail(
                                f"{alternative_path}.kind: unsupported active ENGINE alternative kind {kind}",
                                errors,
                            )
                        if comparison not in ACTIVE_ENGINE_FINANCIAL_CAPABILITIES["comparisons"]:
                            fail(
                                f"{alternative_path}.comparison: unsupported active ENGINE comparison {comparison}",
                                errors,
                            )
                if mode == "ENGINE" and rtype != "FINANCIAL" and not isinstance(requirement.get("engine_rule"), dict):
                    fail(
                        f"$.routes[{route_id}].requirements[{k}].engine_rule: non-financial ENGINE requires engine_rule",
                        errors,
                    )
                if rtype == "FINANCIAL":
                    financial = requirement.get("financial") or {}
                    if mode == "ENGINE" and not isinstance(financial, dict):
                        fail(
                            f"$.routes[{route_id}].requirements[{k}].financial: FINANCIAL ENGINE requires financial object",
                            errors,
                        )
                    if financial.get("model") == "INCOME_WITH_SAVINGS_SHORTFALL" and not isinstance(financial.get("shortfall_coverage"), dict):
                        fail(
                            f"$.routes[{route_id}].requirements[{k}].financial.shortfall_coverage: required for shortfall model",
                            errors,
                        )
                    for a, alternative in enumerate(financial.get("alternatives") or []):
                        if not isinstance(alternative, dict):
                            continue
                        if alternative.get("confidence") == "LOW":
                            fail(
                                f"$.routes[{route_id}].requirements[{k}].financial.alternatives[{a}].confidence: LOW belongs in open_items",
                                errors,
                            )
                        if alternative.get("kind") == "INCOME" and not alternative.get("income_owners"):
                            fail(
                                f"$.routes[{route_id}].requirements[{k}].financial.alternatives[{a}].income_owners: explicit owners required",
                                errors,
                            )
                        if mode == "UNASKED_CONDITION" and alternative.get("asked_in_questionnaire") is True:
                            fail(
                                f"$.routes[{route_id}].requirements[{k}].financial.alternatives[{a}].asked_in_questionnaire: must be false for UNASKED_CONDITION",
                                errors,
                            )
                        guidance = alternative.get("practical_financial_guidance")
                        screening = alternative.get("practical_screening_threshold")
                        if screening is not None:
                            alternative_path = f"$.routes[{route_id}].requirements[{k}].financial.alternatives[{a}]"
                            if mode != "ENGINE" or alternative.get("kind") != "INCOME":
                                fail(f"{alternative_path}.practical_screening_threshold: allowed only on active ENGINE INCOME alternatives", errors)
                            if alternative.get("comparison") != "NO_FIXED_THRESHOLD" or alternative.get("amount") is not None or alternative.get("currency") is not None:
                                fail(f"{alternative_path}.practical_screening_threshold: requires NO_FIXED_THRESHOLD and null legal amount/currency", errors)
                            if guidance is None:
                                fail(f"{alternative_path}.practical_screening_threshold: requires practical_financial_guidance", errors)
                            if isinstance(screening, dict):
                                if screening.get("comparison") != "AT_LEAST":
                                    fail(f"{alternative_path}.practical_screening_threshold.comparison: expected AT_LEAST", errors)
                                if not isinstance(screening.get("currency"), str) or len(screening.get("currency", "")) != 3:
                                    fail(f"{alternative_path}.practical_screening_threshold.currency: invalid or missing", errors)
                                if screening.get("period") not in {"MONTHLY", "ANNUAL"}:
                                    fail(f"{alternative_path}.practical_screening_threshold.period: invalid or missing", errors)
                                amount = screening.get("amount")
                                formula = screening.get("family_formula")
                                if (amount is None) == (formula is None):
                                    fail(f"{alternative_path}.practical_screening_threshold: requires exactly one of amount or family_formula", errors)
                                if amount is not None and (not isinstance(amount, (int, float)) or isinstance(amount, bool) or amount <= 0):
                                    fail(f"{alternative_path}.practical_screening_threshold.amount: must be > 0", errors)
                                if isinstance(formula, dict):
                                    for field in ("base_applicant_amount", "additional_adult_amount", "child_amount"):
                                        value = formula.get(field)
                                        minimum = 0 if field != "base_applicant_amount" else 1
                                        if not isinstance(value, (int, float)) or isinstance(value, bool) or value < minimum:
                                            fail(f"{alternative_path}.practical_screening_threshold.family_formula.{field}: must be {'> 0' if minimum else '>= 0'}", errors)
                        if guidance is not None:
                            alternative_path = f"$.routes[{route_id}].requirements[{k}].financial.alternatives[{a}]"
                            if alternative.get("comparison") != "NO_FIXED_THRESHOLD" or alternative.get("amount") is not None or alternative.get("currency") is not None:
                                fail(
                                    f"{alternative_path}.practical_financial_guidance: allowed only with NO_FIXED_THRESHOLD and null amount/currency",
                                    errors,
                                )
                            if not isinstance(guidance, dict):
                                continue
                            if guidance.get("evaluation_mode") != "DISPLAY_ONLY":
                                fail(f"{alternative_path}.practical_financial_guidance.evaluation_mode: expected DISPLAY_ONLY", errors)
                            status = guidance.get("status")
                            figures = guidance.get("figures")
                            if status == "FOUND" and (not isinstance(figures, list) or not figures):
                                fail(f"{alternative_path}.practical_financial_guidance.figures: FOUND requires at least one figure", errors)
                            if status == "NOT_FOUND" and figures != []:
                                fail(f"{alternative_path}.practical_financial_guidance.figures: NOT_FOUND requires an empty list", errors)
                            if isinstance(figures, list):
                                for f, figure in enumerate(figures):
                                    if not isinstance(figure, dict):
                                        continue
                                    figure_path = f"{alternative_path}.practical_financial_guidance.figures[{f}]"
                                    has_amount = "amount" in figure
                                    has_min = "amount_min" in figure
                                    has_max = "amount_max" in figure
                                    if has_amount == (has_min or has_max) or (has_min != has_max):
                                        fail(f"{figure_path}: requires either amount or amount_min + amount_max, never both", errors)
                                    for amount_field in ("amount", "amount_min"):
                                        if amount_field in figure and (not isinstance(figure[amount_field], (int, float)) or figure[amount_field] <= 0):
                                            fail(f"{figure_path}.{amount_field}: must be > 0", errors)
                                    minimum = figure.get("amount_min")
                                    maximum = figure.get("amount_max")
                                    if minimum is not None and maximum is not None and maximum < minimum:
                                        fail(
                                            f"{figure_path}: amount_max must be >= amount_min",
                                            errors,
                                        )
                                    if not isinstance(figure.get("currency"), str):
                                        fail(f"{figure_path}.currency: required", errors)
                                    if figure.get("period") not in {"MONTHLY", "YEARLY", "ONE_TIME", "OTHER"}:
                                        fail(f"{figure_path}.period: invalid or missing", errors)
                                    evidence = figure.get("evidence")
                                    if not isinstance(evidence, list) or not evidence:
                                        fail(f"{figure_path}.evidence: requires at least one evidence record", errors)
                                    else:
                                        evidence_source_ids: list[str] = []
                                        for e, record in enumerate(evidence):
                                            if not isinstance(record, dict):
                                                continue
                                            evidence_path = f"{figure_path}.evidence[{e}]"
                                            source_id = record.get("source_id")
                                            if not isinstance(source_id, str) or not source_id:
                                                fail(f"{evidence_path}.source_id: required", errors)
                                            else:
                                                evidence_source_ids.append(source_id)
                                                if source_id not in source_set:
                                                    fail(f"{evidence_path}.source_id: unknown source_id {source_id}", errors)
                                            if record.get("evidence_type") not in {"PRACTITIONER_GUIDANCE", "REPORTED_PRACTICE", "INDIVIDUAL_CASE"}:
                                                fail(f"{evidence_path}.evidence_type: invalid or missing", errors)
                                        for duplicate_id in sorted(duplicates(evidence_source_ids)):
                                            fail(f"{figure_path}.evidence: duplicate source_id {duplicate_id}", errors)

            for item in open_items:
                if (
                    isinstance(item, dict)
                    and item.get("related_route_id") == route_id
                    and item.get("blocks_publication") is True
                ):
                    fail(
                        f"$.routes[{route_id}].publishable=true conflicts with blocking open_item "
                        f"{item.get('item_id')}",
                        errors,
                    )

    for i, item in enumerate(open_items):
        if not isinstance(item, dict):
            continue
        related = item.get("related_route_id")
        if related is not None and related not in route_set:
            fail(f"$.open_items[{i}].related_route_id: unknown route_id {related}", errors)

    completeness = data.get("completeness") or {}
    blocks = completeness.get("blocks") or []
    has_blocking_gap = False
    for i, block in enumerate(blocks):
        if not isinstance(block, dict):
            continue
        block_name = block.get("block")
        status = block.get("status")
        ids = block.get("open_item_ids") or []
        if status == "BLOCKING_GAP":
            has_blocking_gap = True
        for item_id in ids:
            if item_id not in open_item_set:
                fail(f"$.completeness.blocks[{i}].open_item_ids: unknown open_item {item_id}", errors)
                continue
            item = open_item_map[item_id]
            if item.get("block") != block_name:
                fail(
                    f"$.completeness.blocks[{i}]: open_item {item_id} belongs to block={item.get('block')}, "
                    f"expected {block_name}",
                    errors,
                )
        if status == "COMPLETE" and ids:
            fail(f"$.completeness.blocks[{i}]: COMPLETE block must not list open_item_ids", errors)
        if status == "BLOCKING_GAP":
            if not ids:
                fail(f"$.completeness.blocks[{i}]: BLOCKING_GAP requires at least one open_item_id", errors)
            elif not any(
                open_item_map.get(x, {}).get("blocks_publication") is True
                and open_item_map.get(x, {}).get("related_route_id") is None
                for x in ids
            ):
                fail(f"$.completeness.blocks[{i}]: BLOCKING_GAP requires a country-level blocking open_item", errors)
        if status == "PARTIAL_NON_BLOCKING":
            for item_id in ids:
                item = open_item_map.get(item_id, {})
                if item.get("blocks_publication") is True and item.get("related_route_id") is None:
                    fail(
                        f"$.completeness.blocks[{i}]: PARTIAL_NON_BLOCKING contains a country-level blocking open_item {item_id}",
                        errors,
                    )

    ready_status = completeness.get("country_ready_status")
    if ready_status in {"READY", "PARTIAL"}:
        if has_blocking_gap:
            fail(f"$.completeness.country_ready_status={ready_status} conflicts with BLOCKING_GAP", errors)
        if country_blocking_items:
            fail(f"$.completeness.country_ready_status={ready_status} conflicts with country-level blocking open_items", errors)

        block_status = {
            block.get("block"): block.get("status")
            for block in blocks
            if isinstance(block, dict)
        }
        if block_status.get("LGBT") != "COMPLETE":
            fail(
                f"$.completeness.country_ready_status={ready_status} requires LGBT=COMPLETE; "
                "PARTIAL cannot replace mandatory LGBT research",
                errors,
            )

    count_open_links: dict[str, int] = {x: 0 for x in open_item_set}
    for block in blocks:
        if isinstance(block, dict):
            for item_id in block.get("open_item_ids") or []:
                if item_id in count_open_links:
                    count_open_links[item_id] += 1
    for item_id, count in sorted(count_open_links.items()):
        if count != 1:
            fail(
                f"$.open_items[{item_id}]: must be linked from exactly one completeness block, found {count}",
                errors,
            )

    schools = data.get("schools") or {}
    school_city_names = [
        item.get("city_name_ru")
        for item in (schools.get("international_school_cities") or [])
        if isinstance(item, dict) and isinstance(item.get("city_name_ru"), str)
    ]
    for city_name in sorted(duplicates(school_city_names)):
        fail(f"$.schools.international_school_cities: duplicate city_name_ru {city_name}", errors)
    for i, school in enumerate(schools.get("international_schools") or []):
        if not isinstance(school, dict):
            continue
        city_id = school.get("city_id")
        if city_id not in city_set:
            fail(f"$.schools.international_schools[{i}].city_id: unknown city_id {city_id}", errors)

    # City coverage and empty cost data must never be silent.
    city_cost_open_items = [
        item for item in open_items
        if isinstance(item, dict) and item.get("block") == "CITIES_COST"
    ]

    roles_seen: set[str] = set()
    for i, city in enumerate(cities):
        if not isinstance(city, dict):
            continue
        roles_seen.update(
            role for role in (city.get("structural_roles") or []) if isinstance(role, str)
        )

        city_size_roles = [
            role
            for role in (city.get("structural_roles") or [])
            if role in {"LARGE", "MEDIUM", "SMALL"}
        ]
        if len(city_size_roles) != 1:
            fail(
                f"$.cities[{i}].structural_roles: every city requires exactly one "
                "size role from LARGE, MEDIUM, SMALL; "
                f"found {city_size_roles or 'none'}",
                errors,
            )

        if not (city.get("cost_components") or []):
            if ready_status in {"READY", "PARTIAL"}:
                fail(
                    f"$.cities[{i}].cost_components: {ready_status} country requires real city cost data; "
                    "empty cost_components means BLOCKED, not PARTIAL",
                    errors,
                )
            elif not city_cost_open_items:
                fail(
                    f"$.cities[{i}].cost_components: empty list requires an explicit CITIES_COST open_item",
                    errors,
                )

    missing_roles = REQUIRED_CITY_ROLES - roles_seen
    if missing_roles and not city_cost_open_items:
        fail(
            "$.cities: missing structural city role(s) "
            + ", ".join(sorted(missing_roles))
            + " without an explicit CITIES_COST open_item",
            errors,
        )

    return errors


validate = validate_integrity


def main() -> int:
    if len(sys.argv) != 2:
        print(
            "Usage: python countrymatcher/data/validate.py path/to/XX-research-v4.0.json",
            file=sys.stderr,
        )
        return 2

    path = Path(sys.argv[1])
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"Cannot read JSON: {exc}", file=sys.stderr)
        return 2

    if not isinstance(data, dict):
        print("Top-level JSON must be an object.", file=sys.stderr)
        return 2

    try:
        schema_errors = validate_schema(data)
    except Exception as exc:
        print(f"Schema validator unavailable: {exc}", file=sys.stderr)
        return 2

    if schema_errors:
        print(f"Schema validation FAILED: {len(schema_errors)} error(s)")
        for error in schema_errors:
            print(f"- {error}")
        return 1

    print("Schema validation PASS")

    errors = validate_integrity(data)
    if errors:
        print(f"Integrity validation FAILED: {len(errors)} error(s)")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Integrity validation PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
