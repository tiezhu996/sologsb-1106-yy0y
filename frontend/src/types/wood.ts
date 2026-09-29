import type { WoodType } from './block'

export interface WoodBatch {
  id: string
  batchNo: string
  woodType: WoodType
  thicknessMm: number
  totalSheets: number
  usedSheets: number
  stockedAt: string
  supplier: string
  note: string
}

export interface WoodShortage {
  id: string
  draftTitle: string
  woodType: WoodType
  thicknessMm: number
  required: number
  available: number
  missing: number
  reportedAt: string
  note: string
}

export interface WoodRequirement {
  woodType: WoodType
  thicknessMm: number
  count: number
}

export interface WoodPlanEntry {
  woodType: WoodType
  batch: WoodBatch
}

export interface WoodShortfall {
  woodType: WoodType
  thicknessMm: number
  required: number
  available: number
  missing: number
}

export interface WoodAllocation {
  ok: boolean
  plan: WoodPlanEntry[]
  short: WoodShortfall[]
}
