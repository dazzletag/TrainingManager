import { Assignment } from "../entities/Assignment";
import { TrainingRequirement } from "../entities/TrainingRequirement";
import { Evidence } from "../entities/Evidence";

const MS_IN_DAY = 1000 * 60 * 60 * 24;

type ComplianceStatus = "compliant" | "at-risk" | "missing";

export interface RequirementCompliance {
  requirement: TrainingRequirement;
  status: ComplianceStatus;
  expiry?: Date;
  evidence: Evidence[];
}

export function evaluateRequirement(
  requirement: TrainingRequirement,
  assignment?: Assignment,
): RequirementCompliance {
  const evidence = assignment?.evidence ?? [];
  const now = new Date();

  const validEntries = evidence.filter((item) => item.validTo > now);
  const expiry = validEntries.length
    ? new Date(Math.max(...validEntries.map((item) => item.validTo.getTime())))
    : undefined;

  if (!requirement.mandatory) {
    return {
      requirement,
      status: "compliant",
      expiry,
      evidence,
    };
  }

  if (!validEntries.length) {
    return {
      requirement,
      status: "missing",
      evidence,
    };
  }

  const daysLeft = expiry ? (expiry.getTime() - now.getTime()) / MS_IN_DAY : 0;
  const status: ComplianceStatus = daysLeft <= 30 ? "at-risk" : "compliant";

  return {
    requirement,
    status,
    expiry,
    evidence,
  };
}
