import { RequirementCompliance } from "./complianceService";

const NEXT_DUE_REGEX = /\s+next due\s*:?.*$/i;
const NEXT_DUE_PAREN_REGEX = /\s+next due\s*\([^)]*\)\s*:?.*$/i;

export function normalizeRequirementName(name: string): string {
  if (!name) {
    return "";
  }
  const normalized = String(name)
    .replace(NEXT_DUE_REGEX, "")
    .replace(NEXT_DUE_PAREN_REGEX, "")
    .replace(/\s+$/, "")
    .replace(/:\s*$/, "")
    .trim();

  return normalized || name;
}

export function isNextDueRequirement(name: string): boolean {
  return NEXT_DUE_REGEX.test(name) || NEXT_DUE_PAREN_REGEX.test(name);
}

export function dedupeRequirementCompliance(
  requirements: RequirementCompliance[],
): RequirementCompliance[] {
  const canonicalMap = new Map<string, RequirementCompliance>();

  for (const requirement of requirements) {
    const canonicalName = normalizeRequirementName(requirement.requirement.name);
    const existing = canonicalMap.get(canonicalName);
    if (!existing) {
      canonicalMap.set(canonicalName, requirement);
      continue;
    }

    const existingIsNextDue = isNextDueRequirement(existing.requirement.name);
    const candidateIsNextDue = isNextDueRequirement(requirement.requirement.name);

    if (existingIsNextDue && !candidateIsNextDue) {
      canonicalMap.set(canonicalName, requirement);
    }
  }

  return Array.from(canonicalMap.values());
}
