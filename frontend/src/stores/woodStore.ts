import { derived, writable } from 'svelte/store'
import type { Draft } from '../types/draft'
import type { Block, ScrapMode, WoodType } from '../types/block'
import type { WoodBatch, WoodShortage } from '../types/wood'
import { db } from '../utils/db'
import { allocateWood, remainingSheets } from '../utils/wood'
import { blockStore } from './blockStore'

const woodBatchList = writable<WoodBatch[]>([])
const woodShortageList = writable<WoodShortage[]>([])

export interface WoodStock {
  woodType: WoodType
  total: number
  used: number
  remaining: number
}

const stockByType = derived(woodBatchList, ($batches) => {
  const stock: Record<WoodType, WoodStock> = {
    黄杨: { woodType: '黄杨', total: 0, used: 0, remaining: 0 },
    梨木: { woodType: '梨木', total: 0, used: 0, remaining: 0 },
  }
  for (const batch of $batches) {
    const current = stock[batch.woodType]
    current.total += batch.totalSheets
    current.used += batch.usedSheets
    current.remaining += remainingSheets(batch)
  }
  return stock
})

async function load(): Promise<void> {
  const [batches, shortages] = await Promise.all([db.woodBatches.toArray(), db.woodShortages.toArray()])
  batches.sort((a, b) => a.stockedAt.localeCompare(b.stockedAt) || a.batchNo.localeCompare(b.batchNo, 'zh-CN'))
  shortages.sort((a, b) => b.reportedAt.localeCompare(a.reportedAt))
  woodBatchList.set(batches)
  woodShortageList.set(shortages)
}

async function createBatch(input: Omit<WoodBatch, 'id' | 'usedSheets'>): Promise<string> {
  const id = `wood-${crypto.randomUUID()}`
  await db.woodBatches.add({ id, usedSheets: 0, ...input })
  await load()
  return id
}

export interface DraftCreateResult {
  ok: boolean
  draftId?: string
  shortages?: WoodShortage[]
}

const BASE_BLOCKS: Array<{ blockName: Block['blockName']; woodType: WoodType; thicknessMm: number }> = [
  { blockName: '墨线版', woodType: '黄杨', thicknessMm: 18 },
  { blockName: '黄版', woodType: '梨木', thicknessMm: 20 },
  { blockName: '红版', woodType: '梨木', thicknessMm: 20 },
  { blockName: '绿版', woodType: '梨木', thicknessMm: 20 },
]

/**
 * 新立画稿：黄杨开墨线版一块、梨木开套色版三块，从最早合用批次领料。
 * 木料足才把画稿与四块版片一起建好；不足只写缺口，不留半套记录。
 */
async function createDraftWithBlocks(input: Omit<Draft, 'id'>): Promise<DraftCreateResult> {
  const requirements = BASE_BLOCKS.reduce<Record<WoodType, { thicknessMm: number; count: number }>>(
    (acc, item) => {
      const current = acc[item.woodType] ?? { thicknessMm: item.thicknessMm, count: 0 }
      current.count += 1
      current.thicknessMm = item.thicknessMm
      acc[item.woodType] = current
      return acc
    },
    {} as Record<WoodType, { thicknessMm: number; count: number }>,
  )

  return await db.transaction(
    'rw',
    db.drafts,
    db.blocks,
    db.woodBatches,
    db.woodShortages,
    async () => {
      const batches = await db.woodBatches.toArray()
      const allocation = allocateWood(
        batches,
        (['黄杨', '梨木'] as WoodType[]).map((woodType) => ({
          woodType,
          thicknessMm: requirements[woodType]?.thicknessMm ?? 20,
          count: requirements[woodType]?.count ?? 0,
        })),
      )

      if (!allocation.ok) {
        const recorded: WoodShortage[] = []
        for (const shortfall of allocation.short) {
          const record: WoodShortage = {
            id: `shortage-${crypto.randomUUID()}`,
            draftTitle: input.title,
            woodType: shortfall.woodType,
            thicknessMm: shortfall.thicknessMm,
            required: shortfall.required,
            available: shortfall.available,
            missing: shortfall.missing,
            reportedAt: new Date().toISOString().slice(0, 10),
            note: '',
          }
          await db.woodShortages.add(record)
          recorded.push(record)
        }
        return { ok: false, shortages: recorded }
      }

      const draftId = `draft-${crypto.randomUUID()}`
      await db.drafts.add({ id: draftId, ...input })

      const queues: Record<WoodType, WoodBatch[]> = { 黄杨: [], 梨木: [] }
      for (const entry of allocation.plan) queues[entry.woodType].push(entry.batch)

      for (let index = 0; index < BASE_BLOCKS.length; index += 1) {
        const template = BASE_BLOCKS[index]
        if (!template) continue
        const batch = queues[template.woodType].shift()
        if (!batch) throw new Error(`木料分配缺少${template.woodType}批次`)
        await db.blocks.add({
          id: `block-${crypto.randomUUID()}`,
          draftId,
          blockName: template.blockName,
          colorNo: index + 1,
          woodType: template.woodType,
          thicknessMm: batch.thicknessMm,
          woodBatchId: batch.id,
          carvedBy: '',
          state: '待刻',
          defectNote: '',
        })
      }

      const usedByBatch = new Map<string, number>()
      for (const entry of allocation.plan) {
        usedByBatch.set(entry.batch.id, (usedByBatch.get(entry.batch.id) ?? 0) + 1)
      }
      for (const [batchId, take] of usedByBatch) {
        const batch = batches.find((item) => item.id === batchId)
        if (!batch) continue
        await db.woodBatches.update(batchId, { usedSheets: batch.usedSheets + take })
      }

      return { ok: true, draftId }
    },
  )
}

/** 作废版片：按原批退库（回冲领用）或记损耗（不回冲）。 */
async function scrapBlock(block: Block, mode: ScrapMode, note: string): Promise<void> {
  await db.transaction('rw', db.blocks, db.woodBatches, async () => {
    if (mode === '退库' && block.woodBatchId) {
      const batch = await db.woodBatches.get(block.woodBatchId)
      if (batch) {
        await db.woodBatches.update(batch.id, { usedSheets: Math.max(0, batch.usedSheets - 1) })
      }
    }
    await db.blocks.update(block.id, {
      state: '已作废',
      scrappedAt: new Date().toISOString().slice(0, 16),
      scrapMode: mode,
      scrapNote: note.trim(),
    })
  })
  await Promise.all([blockStore.load(), load()])
}

/** 旧版片首次打开编排台时补成历史无编号（无领用批次）。 */
async function backfillLegacy(blocks: Block[]): Promise<void> {
  const legacy = blocks.filter((block) => !block.woodBatchId && !block.legacy)
  if (legacy.length === 0) return
  await db.transaction('rw', db.blocks, async () => {
    for (const block of legacy) {
      await db.blocks.update(block.id, { legacy: true })
    }
  })
  await blockStore.load()
}

export const woodStore = {
  subscribe: woodBatchList.subscribe,
  shortages: { subscribe: woodShortageList.subscribe },
  stockByType,
  load,
  createBatch,
  createDraftWithBlocks,
  scrapBlock,
  backfillLegacy,
}
