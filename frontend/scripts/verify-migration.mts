import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import assert from 'node:assert/strict'

// 1. 以 v2 结构造一个旧库（模拟已上线用户）
const legacy = new Dexie('gbwoodprint-db')
legacy.version(1).stores({
  drafts: 'id, genre, status, title',
  blocks: 'id, draftId, colorNo, carvedBy, state',
  carvers: 'id, specialty, skillLevel, name',
  batches: 'id, draftId, batchNo, printedAt',
  nodes: 'id, batchId, blockId, stage, seq, operator',
})
legacy.version(2).stores({
  drafts: 'id, genre, status, title, schemaRev',
  blocks: 'id, draftId, colorNo, carvedBy, state, schemaRev',
  carvers: 'id, specialty, skillLevel, name, schemaRev',
  batches: 'id, draftId, batchNo, printedAt, schemaRev',
  nodes: 'id, batchId, blockId, stage, seq, operator, schemaRev',
})
await legacy.table('drafts').add({ id: 'draft-old-1', title: '旧画稿', genre: '门神', status: '起稿', schemaRev: 2 })
await legacy.table('blocks').add({
  id: 'block-old-1',
  draftId: 'draft-old-1',
  blockName: '墨线版',
  colorNo: 1,
  woodType: '黄杨',
  thicknessMm: 18,
  carvedBy: '',
  state: '待刻',
  defectNote: '',
  schemaRev: 2,
})
await legacy.close()

// 2. 用新代码打开，触发 v3 升级
const { db, initializeDatabase } = await import('../src/utils/db.ts')
await initializeDatabase()

const oldDraft = await db.drafts.get('draft-old-1')
assert.ok(oldDraft, '旧画稿必须保留')
assert.equal(oldDraft.title, '旧画稿')
const oldBlock = await db.blocks.get('block-old-1')
assert.ok(oldBlock, '旧版片必须保留')
assert.equal(oldBlock.state, '待刻')

// 新表存在且为空（旧库不会被重新 populate）
assert.equal(await db.woodBatches.count(), 0)
assert.equal(await db.woodMovements.count(), 0)
assert.equal(await db.woodShortfalls.count(), 0)

// 3. 旧版片无木料来源时，首次打开编排台补成历史无编号
const { woodStore } = await import('../src/stores/woodStore.ts')
assert.equal(oldBlock.sourceKind, undefined)
await woodStore.backfillLegacyBlocks('draft-old-1')
const backfilled = await db.blocks.get('block-old-1')
assert.equal(backfilled?.sourceKind, '历史无编号')

// 4. 旧库木料表为空时，新立画稿应写缺口而不是报错/建半套
const result = await woodStore.createDraftWithBlocks({
  title: '旧库新画稿',
  genre: '娃娃',
  designer: '测试员',
  sizeCm: '1 × 1 cm',
  paperNote: '',
  status: '起稿',
  lineThicknessMm: 18,
  colorThicknessMm: 20,
})
assert.equal(result.ok, false)
assert.equal(result.shortfallItems.length, 2)
assert.equal(await db.drafts.where('title').equals('旧库新画稿').count(), 0)

console.log('v2→v3 迁移断言通过 ✔')
await db.close()
