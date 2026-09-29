import { writable } from 'svelte/store'
import type { Block, BlockName, WoodType } from '../types/block'
import type { Draft, DraftGenre, DraftStatus } from '../types/draft'
import type { WoodBatch, WoodMovement, WoodShortfall } from '../types/wood'
import { db } from '../utils/db'

export interface NewDraftRequest {
  title: string
  genre: DraftGenre
  designer: string
  sizeCm: string
  paperNote: string
  status: DraftStatus
  /** 墨线版（黄杨）要求厚度 */
  lineThicknessMm: number
  /** 其余三块套色版（梨木）要求厚度 */
  colorThicknessMm: number
}

export interface CreateDraftResult {
  ok: boolean
  draftId?: string
  /** 不足时逐项描述，如 黄杨 18mm 缺 1 张 */
  shortfallItems: string[]
}

export type BlockDisposition = '退库' | '损耗'

interface AllocationChunk {
  batchId: string
  batchNo: string
  qty: number
}

const woodBatchList = writable<WoodBatch[]>([])
const woodMovementList = writable<WoodMovement[]>([])
const woodShortfallList = writable<WoodShortfall[]>([])

const BLOCK_NAMES: BlockName[] = ['墨线版', '黄版', '红版', '绿版']

async function loadBatches(): Promise<void> {
  const records = await db.woodBatches.toArray()
  records.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.batchNo.localeCompare(b.batchNo, 'zh-CN'))
  woodBatchList.set(records)
}

async function loadMovements(): Promise<void> {
  const records = await db.woodMovements.toArray()
  records.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  woodMovementList.set(records)
}

async function loadShortfalls(): Promise<void> {
  const records = await db.woodShortfalls.toArray()
  records.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  woodShortfallList.set(records)
}

async function loadAll(): Promise<void> {
  await Promise.all([loadBatches(), loadMovements(), loadShortfalls()])
}

async function createWoodBatch(
  input: Omit<WoodBatch, 'id' | 'remainingQty'>,
): Promise<string> {
  const id = `wood-${crypto.randomUUID()}`
  const occurredAt = `${input.receivedAt}T09:00`
  await db.transaction('rw', db.woodBatches, db.woodMovements, async () => {
    await db.woodBatches.add({ id, ...input, remainingQty: input.receivedQty })
    await db.woodMovements.add({
      id: `woodmove-${crypto.randomUUID()}`,
      movementType: '入库',
      woodBatchId: id,
      woodBatchNo: input.batchNo,
      woodType: input.woodType,
      thicknessMm: input.thicknessMm,
      qty: input.receivedQty,
      occurredAt,
      refNote: input.supplierNote || '新料入库',
    })
  })
  await loadAll()
  return id
}

/** 同树种同厚度、按入库时间从早到晚取料 */
function planAllocation(batches: WoodBatch[], woodType: WoodType, thicknessMm: number, needQty: number): AllocationChunk[] {
  const usable = batches
    .filter((batch) => batch.woodType === woodType && batch.thicknessMm === thicknessMm && batch.remainingQty > 0)
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id))

  const chunks: AllocationChunk[] = []
  let remaining = needQty
  for (const batch of usable) {
    if (remaining <= 0) break
    const takeQty = Math.min(batch.remainingQty, remaining)
    chunks.push({ batchId: batch.id, batchNo: batch.batchNo, qty: takeQty })
    remaining -= takeQty
  }
  return chunks
}

function woodLabel(woodType: WoodType, thicknessMm: number): string {
  return `${woodType} ${thicknessMm}mm`
}

/**
 * 新立画稿：墨线版用黄杨 1 张、其余三块用梨木，从最早合用批次领料。
 * 黄杨与梨木都够配齐四块时，画稿与四块版片一次性建好；
 * 不够则只写缺口记录，不留下任何半套画稿或版片。
 */
async function createDraftWithBlocks(input: NewDraftRequest): Promise<CreateDraftResult> {
  const needs: Array<{ woodType: WoodType; thicknessMm: number; qty: number }> = [
    { woodType: '黄杨', thicknessMm: input.lineThicknessMm, qty: 1 },
    { woodType: '梨木', thicknessMm: input.colorThicknessMm, qty: 3 },
  ]

  const result = await db.transaction(
    'rw',
    db.drafts,
    db.blocks,
    db.woodBatches,
    db.woodMovements,
    db.woodShortfalls,
    async () => {
      const batches = await db.woodBatches.toArray()

      // 先盘料：树种、厚度合用且够成套，缺一不可
      const shortfallItems: string[] = []
      const plans: Array<{ need: (typeof needs)[number]; chunks: AllocationChunk[] }> = []
      for (const need of needs) {
        const chunks = planAllocation(batches, need.woodType, need.thicknessMm, need.qty)
        const allocated = chunks.reduce((sum, chunk) => sum + chunk.qty, 0)
        if (allocated < need.qty) {
          shortfallItems.push(`${woodLabel(need.woodType, need.thicknessMm)} 缺 ${need.qty - allocated} 张`)
        }
        plans.push({ need, chunks })
      }

      if (shortfallItems.length > 0) {
        await db.woodShortfalls.add({
          id: `shortfall-${crypto.randomUUID()}`,
          draftTitle: input.title,
          occurredAt: new Date().toISOString().slice(0, 16),
          items: shortfallItems,
          note: '木料不足以配齐四块版（墨线版黄杨一块、套色版梨木三块），画稿与版片均未建立。',
        })
        return { ok: false as const, shortfallItems }
      }

      const draftId = `draft-${crypto.randomUUID()}`
      const draft: Draft = {
        id: draftId,
        title: input.title,
        genre: input.genre,
        designer: input.designer,
        sizeCm: input.sizeCm,
        paperNote: input.paperNote,
        status: input.status,
      }
      await db.drafts.add(draft)

      // 把各树种的领料计划展开成“每一块版取自哪一批”的队列（FIFO）
      const lineAssignments = plans[0].chunks.flatMap((chunk) => Array<AllocationChunk>(chunk.qty).fill(chunk))
      const colorAssignments = plans[1].chunks.flatMap((chunk) => Array<AllocationChunk>(chunk.qty).fill(chunk))

      for (let index = 0; index < BLOCK_NAMES.length; index += 1) {
        const blockName = BLOCK_NAMES[index]
        if (!blockName) continue
        const isLineBlock = index === 0
        const chosen = (isLineBlock ? lineAssignments : colorAssignments)[isLineBlock ? 0 : index - 1]
        if (!chosen) throw new Error('木料分配异常')

        const blockId = `block-${crypto.randomUUID()}`
        const block: Block = {
          id: blockId,
          draftId,
          blockName,
          colorNo: index + 1,
          woodType: isLineBlock ? '黄杨' : '梨木',
          thicknessMm: isLineBlock ? input.lineThicknessMm : input.colorThicknessMm,
          carvedBy: '',
          state: '待刻',
          defectNote: '',
          sourceKind: '批次',
          sourceBatchId: chosen.batchId,
          sourceBatchNo: chosen.batchNo,
        }
        await db.blocks.add(block)

        const batch = await db.woodBatches.get(chosen.batchId)
        if (!batch) throw new Error(`木料批次 ${chosen.batchNo} 不存在`)
        await db.woodBatches.update(chosen.batchId, { remainingQty: batch.remainingQty - 1 })
        await db.woodMovements.add({
          id: `woodmove-${crypto.randomUUID()}`,
          movementType: '领料',
          woodBatchId: chosen.batchId,
          woodBatchNo: chosen.batchNo,
          woodType: block.woodType,
          thicknessMm: block.thicknessMm,
          qty: 1,
          occurredAt: new Date().toISOString().slice(0, 16),
          blockId,
          draftId,
          refNote: `新立画稿《${input.title}》领用${blockName}`,
        })
      }

      return { ok: true as const, draftId, shortfallItems: [] }
    },
  )

  await loadAll()
  return result
}

/**
 * 作废版片：在册批次来源按原批退库（结存加回），历史旧版只能记损耗。
 */
async function scrapBlock(
  block: Block,
  disposition: BlockDisposition,
  reason: string,
): Promise<{ ok: boolean; message: string }> {
  const cleanReason = reason.trim() || '未填写作废原因'
  if (block.state === '已作废') return { ok: false, message: '这块版片已经作废，无需重复处理。' }

  if (disposition === '退库') {
    if (block.sourceKind !== '批次' || !block.sourceBatchId) {
      return { ok: false, message: '历史旧版没有原批可退，只能记为损耗。' }
    }
    const outcome = await db.transaction(
      'rw',
      db.blocks,
      db.woodBatches,
      db.woodMovements,
      db.carvers,
      async () => {
        const batch = await db.woodBatches.get(block.sourceBatchId!)
        if (!batch) return { ok: false as const, message: `原批 ${block.sourceBatchNo ?? ''} 已不在台账，无法退库，请改记损耗。` }
        await db.woodBatches.update(batch.id, { remainingQty: batch.remainingQty + 1 })
        await db.blocks.update(block.id, { state: '已作废' })
        await releaseCarverBlockTx(block.id)
        await db.woodMovements.add({
          id: `woodmove-${crypto.randomUUID()}`,
          movementType: '退库',
          woodBatchId: batch.id,
          woodBatchNo: batch.batchNo,
          woodType: batch.woodType,
          thicknessMm: batch.thicknessMm,
          qty: 1,
          occurredAt: new Date().toISOString().slice(0, 16),
          blockId: block.id,
          draftId: block.draftId,
          refNote: `版片作废按原批退库 · ${block.blockName}：${cleanReason}`,
        })
        return { ok: true as const, message: '' }
      },
    )
    if (!outcome.ok) return outcome
    await loadAll()
    return { ok: true, message: `${block.blockName}已作废，木料退回原批 ${block.sourceBatchNo ?? ''}。` }
  }

  await db.transaction('rw', db.blocks, db.woodBatches, db.woodMovements, db.carvers, async () => {
    await db.blocks.update(block.id, { state: '已作废' })
    await releaseCarverBlockTx(block.id)
    const sourceBatch = block.sourceKind === '批次' && block.sourceBatchId
      ? await db.woodBatches.get(block.sourceBatchId)
      : undefined
    await db.woodMovements.add({
      id: `woodmove-${crypto.randomUUID()}`,
      movementType: '损耗',
      woodBatchId: sourceBatch?.id ?? `损耗-${block.woodType}`,
      woodBatchNo: sourceBatch?.batchNo ?? (block.sourceKind === '历史无编号' ? '历史旧版无编号' : '无批次'),
      woodType: block.woodType,
      thicknessMm: block.thicknessMm,
      qty: 1,
      occurredAt: new Date().toISOString().slice(0, 16),
      blockId: block.id,
      draftId: block.draftId,
      refNote: `版片作废记损耗 · ${block.blockName}：${cleanReason}`,
    })
  })
  await loadAll()
  return { ok: true, message: `${block.blockName}已作废并记损耗。` }
}

/** 事务内把版片从所有刻工的在刻名单中摘除 */
async function releaseCarverBlockTx(blockId: string): Promise<void> {
  const carvers = await db.carvers.toArray()
  for (const carver of carvers) {
    if (!carver.activeBlockIds.includes(blockId)) continue
    await db.carvers.update(carver.id, {
      activeBlockIds: carver.activeBlockIds.filter((id) => id !== blockId),
    })
  }
}

/** 旧版片首次打开编排台时补成“历史无编号”，幂等 */
async function backfillLegacyBlocks(draftId: string): Promise<number> {
  const pending = await db.blocks
    .where('draftId')
    .equals(draftId)
    .filter((block) => block.sourceKind === undefined)
    .toArray()
  if (pending.length === 0) return 0
  await db.blocks.bulkUpdate(
    pending.map((block) => ({
      key: block.id,
      changes: { sourceKind: '历史无编号' as const },
    })),
  )
  return pending.length
}

export const woodStore = {
  woodBatches: { subscribe: woodBatchList.subscribe },
  woodMovements: { subscribe: woodMovementList.subscribe },
  woodShortfalls: { subscribe: woodShortfallList.subscribe },
  load: loadAll,
  loadBatches,
  createWoodBatch,
  createDraftWithBlocks,
  scrapBlock,
  backfillLegacyBlocks,
}
