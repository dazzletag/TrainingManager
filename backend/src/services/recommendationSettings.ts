import { AppDataSource } from "../db/data-source";
import { RecommendationSettings } from "../entities/RecommendationSettings";

const DEFAULT_SETTINGS = {
  atRiskWindowDays: 60,
  minimumAttendeesDefault: 8,
  importanceWeightMultiplier: 2,
};

export async function getRecommendationSettings(): Promise<RecommendationSettings> {
  const repo = AppDataSource.getRepository(RecommendationSettings);
  const existing = await repo.find({ order: { updatedAt: "DESC" }, take: 1 });
  if (existing.length) {
    return existing[0];
  }
  const created = repo.create(DEFAULT_SETTINGS);
  return repo.save(created);
}

export function coerceRecommendationSettings(input: Partial<RecommendationSettings>) {
  const updates: Partial<RecommendationSettings> = {};
  if (input.atRiskWindowDays !== undefined) {
    updates.atRiskWindowDays = Math.max(1, Number(input.atRiskWindowDays));
  }
  if (input.minimumAttendeesDefault !== undefined) {
    updates.minimumAttendeesDefault = Math.max(1, Number(input.minimumAttendeesDefault));
  }
  if (input.importanceWeightMultiplier !== undefined) {
    updates.importanceWeightMultiplier = Math.max(1, Number(input.importanceWeightMultiplier));
  }
  return updates;
}
