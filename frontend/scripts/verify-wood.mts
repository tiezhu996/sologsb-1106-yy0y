import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { db, initializeDatabase } from '../src/utils/db.ts'
import { woodStore } from '../src/stores/woodStore.ts'
import { blockStore } from '../src/stores/blockStore.ts'

await initializeDatabase()

// 1. 期初：黄杨 18mm 6 张、梨木 20mm 12 张、梨木 18mm 2 张
let huangyang = await db.woodBatches.where('woodType').equals('黄杨').toArray()
assert.equal(huangyang[0]?.remainingQty, 6)

// 2. 厚度不合：墨线 17mm（无批次）→ 缺口，不落画稿/版片
const draftsBefore = await db.drafts.count()
const fail1 = await woodStore.createDraftWithBlocks({
  title: '测试-无此厚度',
  genre: '戏出',
  designer: '测试员',
  sizeCm: '1 × 1 cm',
  paperNote: '',
  status: '起稿',
  lineThicknessMm: 17,
  colorThicknessMm: 20,
})
assert.equal(fail1.ok, false)
assert.deepEqual(fail1.shortfallItems, ['黄杨 17mm 缺 1 张'])
assert.equal(await db.drafts.count(), draftsBefore, '缺口时不得新建画稿')

// 3. 梨木 18mm 只有 2 张，要 3 张 → 缺口
const fail2 = await woodStore.createDraftWithBlocks({
  title: '测试-梨木薄料不足',
  genre: '娃娃',
  designer: '测试员',
  sizeCm: '1 × 1 cm',
  paperNote: '',
  status: '起稿',
  lineThicknessMm: 18,
  colorThicknessMm: 18,
})
assert.equal(fail2.ok, false)
assert.deepEqual(fail2.shortfallItems, ['梨木 18mm 缺 1 张'])
assert.equal(await db.drafts.count(), draftsBefore)

// 4. 够料（黄杨18 1张 + 梨木20 3张）→ 整建成套
const ok = await woodStore.createDraftWithBlocks({
  title: '测试-成套开版',
  genre: '门神',
  designer: '测试员',
  sizeCm: '30 × 20 cm',
  paperNote: '',
  status: '起稿',
  lineThicknessMm: 18,
  colorThicknessMm: 20,
})
assert.equal(ok.ok, true)
assert.ok(ok.draftId)
const newBlocks = (await db.blocks.where('draftId').equals(ok.draftId!).toArray()).sort((a, b) => a.colorNo - b.colorNo)
assert.equal(newBlocks.length, 4, '四块版片应一次性建齐')
assert.equal(newBlocks.find((b) => b.blockName === '墨线版')?.woodType, '黄杨')
assert.deepEqual(newBlocks.filter((b) => b.woodType === '梨木').map((b) => b.blockName), ['黄版', '红版', '绿版'])
assert.ok(newBlocks.every((b) => b.sourceKind === '批次' && b.sourceBatchNo))

// 结存：黄杨 6→5、梨木20 12→9
assert.equal((await db.woodBatches.get('wood-hy-2601'))?.remainingQty, 5)
assert.equal((await db.woodBatches.get('wood-lm-2601'))?.remainingQty, 9)

// 领料流水 4 条
const issues = await db.woodMovements.where('movementType').equals('领料').toArray()
assert.equal(issues.length, 4)

// 5. FIFO：新增更早日期批次后再建一稿，应先吃早批
await woodStore.createWoodBatch({
  batchNo: '黄杨-2512',
  woodType: '黄杨',
  thicknessMm: 18,
  receivedQty: 1,
  receivedAt: '2025-12-01',
  supplierNote: '更早的老料',
})
const ok2 = await woodStore.createDraftWithBlocks({
  title: '测试-FIFO',
  genre: '灶王',
  designer: '测试员',
  sizeCm: '30 × 20 cm',
  paperNote: '',
  status: '起稿',
  lineThicknessMm: 18,
  colorThicknessMm: 20,
})
assert.equal(ok2.ok, true)
const lineBlock = (await db.blocks.where('draftId').equals(ok2.draftId!).toArray()).find((b) => b.blockName === '墨线版')
assert.equal(lineBlock?.sourceBatchNo, '黄杨-2512', '应从最早批次领料')
assert.equal((await db.woodBatches.get('wood-hy-2601'))?.remainingQty, 5, '晚批不应被动')

// 6. 历史旧版补登
await woodStore.backfillLegacyBlocks('draft-menshen-qin')
await blockStore.load()
const legacy = await db.blocks.where('draftId').equals('draft-menshen-qin').toArray()
assert.ok(legacy.every((b) => b.sourceKind === '历史无编号'))

// 7. 历史旧版作废：只能损耗
const legacyBlock = legacy[0]!
const refuseReturn = await woodStore.scrapBlock(legacyBlock, '退库', '测试')
assert.equal(refuseReturn.ok, false)
const scrappedLoss = await woodStore.scrapBlock(legacyBlock, '损耗', '虫蛀')
assert.equal(scrappedLoss.ok, true)
assert.equal((await db.blocks.get(legacyBlock.id))?.state, '已作废')
const losses = await db.woodMovements.where('movementType').equals('损耗').toArray()
assert.equal(losses.length, 1)
assert.equal(losses[0]?.woodBatchNo, '历史旧版无编号')

// 8. 批次来源作废退库：原批结存加回
const batchBlock = newBlocks.find((b) => b.blockName === '红版')!
const before = (await db.woodBatches.get(batchBlock.sourceBatchId!))!.remainingQty
const scrappedReturn = await woodStore.scrapBlock(batchBlock, '退库', '开裂透底')
assert.equal(scrappedReturn.ok, true)
const after = (await db.woodBatches.get(batchBlock.sourceBatchId!))!.remainingQty
assert.equal(after, before + 1, '退库应加回原批结存')
const returns = await db.woodMovements.where('movementType').equals('退库').toArray()
assert.equal(returns.length, 1)
assert.equal(returns[0]?.qty, 1)

// 9. 幂等补登
await woodStore.backfillLegacyBlocks('draft-menshen-qin')
assert.ok((await db.blocks.where('draftId').equals('draft-menshen-qin').toArray()).every((b) => b.sourceKind === '历史无编号'))

console.log('全部木料台账逻辑断言通过 ✔')
await db.close()
