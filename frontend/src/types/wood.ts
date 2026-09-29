import type { WoodType } from './block'

/** 木料入库批次（黄杨 / 梨木板料） */
export interface WoodBatch {
  id: string
  /** 批次编号，如 黄杨-2601 */
  batchNo: string
  woodType: WoodType
  thicknessMm: number
  /** 入库张数 */
  receivedQty: number
  /** 当前结存张数（领走减少，退库增加） */
  remainingQty: number
  receivedAt: string
  supplierNote: string
}

/** 木料流水：入库、领料、退库、损耗 */
export type WoodMovementType = '入库' | '领料' | '退库' | '损耗'

export interface WoodMovement {
  id: string
  movementType: WoodMovementType
  woodBatchId: string
  woodBatchNo: string
  woodType: WoodType
  thicknessMm: number
  qty: number
  occurredAt: string
  /** 领料 / 退库 / 损耗对应的版片 */
  blockId?: string
  draftId?: string
  /** 领料对应的画稿标题、作废原因等 */
  refNote: string
}

/** 画稿领料不足时留下的缺口记录（不落任何半套画稿、版片） */
export interface WoodShortfall {
  id: string
  draftTitle: string
  occurredAt: string
  /** 逐项缺口，如 黄杨 18mm 缺 1 张 */
  items: string[]
  note: string
}
