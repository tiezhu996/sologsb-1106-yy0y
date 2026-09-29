import type { WoodAllocation, WoodBatch, WoodPlanEntry, WoodRequirement, WoodShortfall } from '../types/wood'

export function remainingSheets(batch: WoodBatch): number {
  return Math.max(0, batch.totalSheets - batch.usedSheets)
}

/**
 * 按树种从最早入库的合用批次领料（先进先出）。
 * 合用口径：树种一致即合用；厚度随批次实际厚记录到版片。
 * 任一树种不足时 ok=false，short 列出缺口，且 plan 只含已领部分，
 * 调用方不得据此开版——宁写缺口，不留半套。
 */
export function allocateWood(batches: WoodBatch[], requirements: WoodRequirement[]): WoodAllocation {
  const plan: WoodPlanEntry[] = []
  const short: WoodShortfall[] = []

  for (const requirement of requirements) {
    const candidates = batches
      .filter((batch) => batch.woodType === requirement.woodType && remainingSheets(batch) > 0)
      .sort((a, b) => a.stockedAt.localeCompare(b.stockedAt) || a.batchNo.localeCompare(b.batchNo, 'zh-CN'))

    let needed = requirement.count
    let available = 0
    for (const batch of candidates) {
      if (needed <= 0) break
      const take = Math.min(remainingSheets(batch), needed)
      available += take
      for (let i = 0; i < take; i += 1) {
        plan.push({ woodType: requirement.woodType, batch })
      }
      needed -= take
    }

    if (needed > 0) {
      short.push({
        woodType: requirement.woodType,
        thicknessMm: requirement.thicknessMm,
        required: requirement.count,
        available,
        missing: needed,
      })
    }
  }

  return { ok: short.length === 0, plan, short }
}
