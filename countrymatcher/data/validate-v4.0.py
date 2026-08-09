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
import sys
from pathlib import Path
from typing import Any, Iterable

REQUIRED_CITY_ROLES = {"CAPITAL", "LARGE", "MEDIUM", "SMALL"}
FINAL_CANON_REVISION = "2026-08-08-final-lock"


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

        if route.get("publishable") is False:
            has_route_blocker = any(
                item.get("related_route_id") == route_id and item.get("blocks_publication") is True
                for item in route_blocking_items
            )
            if not has_route_blocker:
                fail(
                    f"$.routes[{route_id}].publishable=false requires a related blocking open_item explaining why the route is hidden",
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

    if completeness.get("country_ready_status") == "READY":
        if has_blocking_gap:
            fail("$.completeness.country_ready_status=READY conflicts with BLOCKING_GAP", errors)
        if country_blocking_items:
            fail("$.completeness.country_ready_status=READY conflicts with country-level blocking open_items", errors)

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
        if not (city.get("cost_components") or []) and not city_cost_open_items:
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
