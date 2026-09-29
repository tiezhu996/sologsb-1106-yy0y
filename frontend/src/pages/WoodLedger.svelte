<script lang="ts">
  import { onMount } from 'svelte'
  import { link } from 'svelte-spa-router'
  import EmptyBox from '../components/common/EmptyBox.svelte'
  import { woodStore } from '../stores/woodStore'
  import { blockStore } from '../stores/blockStore'
  import { downloadJson } from '../utils/export'
  import type { WoodType } from '../types/block'
  import type { WoodBatch, WoodMovement } from '../types/wood'

  let showBatchForm = $state(false)
  let batchNo = $state('')
  let woodType = $state<WoodType>('黄杨')
  let thicknessMm = $state(18)
  let receivedQty = $state(6)
  let receivedAt = $state(new Date().toISOString().slice(0, 10))
  let supplierNote = $state('')
  let formMessage = $state('')

  let woodFilter = $state<WoodType | '全部'>('全部')

  const woodBatches = woodStore.woodBatches
  const woodMovements = woodStore.woodMovements
  const woodShortfalls = woodStore.woodShortfalls

  const filteredBatches = $derived(
    $woodBatches
      .filter((batch) => woodFilter === '全部' || batch.woodType === woodFilter)
      .sort((a, b) => a.woodType.localeCompare(b.woodType, 'zh-CN') || a.thicknessMm - b.thicknessMm || a.receivedAt.localeCompare(b.receivedAt)),
  )

  const totalHuangyang = $derived(
    $woodBatches.filter((batch) => batch.woodType === '黄杨').reduce((sum, batch) => sum + batch.remainingQty, 0),
  )
  const totalLimu = $derived(
    $woodBatches.filter((batch) => batch.woodType === '梨木').reduce((sum, batch) => sum + batch.remainingQty, 0),
  )

  onMount(() => {
    void Promise.all([woodStore.load(), blockStore.load()])
  })

  function openBatchForm(): void {
    showBatchForm = true
    formMessage = ''
  }

  async function submitBatch(): Promise<void> {
    if (!batchNo.trim()) {
      formMessage = '请填写批次编号。'
      return
    }
    if (thicknessMm <= 0 || receivedQty <= 0) {
      formMessage = '厚度与入库张数都须为正数。'
      return
    }
    const duplicated = $woodBatches.some((batch) => batch.batchNo === batchNo.trim())
    if (duplicated) {
      formMessage = '该批次编号已登记，请勿重复入库。'
      return
    }

    await woodStore.createWoodBatch({
      batchNo: batchNo.trim(),
      woodType,
      thicknessMm: Number(thicknessMm),
      receivedQty: Number(receivedQty),
      receivedAt,
      supplierNote: supplierNote.trim(),
    })

    batchNo = ''
    thicknessMm = woodType === '黄杨' ? 18 : 20
    receivedQty = 6
    supplierNote = ''
    formMessage = ''
    showBatchForm = false
  }

  function changeWoodType(value: WoodType): void {
    woodType = value
    thicknessMm = value === '黄杨' ? 18 : 20
  }

  function formatTime(value: string): string {
    return value.replace('T', ' ')
  }

  function movementClass(type: WoodMovement['movementType']): string {
    return `movement-${type}`
  }

  function blockLabel(blockId: string | undefined): string {
    if (!blockId) return ''
    const block = $blockStore.find((item) => item.id === blockId)
    return block ? `${block.blockName}（色序 ${block.colorNo}）` : '版片已不在册'
  }

  async function exportWoodArchive(): Promise<void> {
    downloadJson('木料台账.json', {
      exportedAt: new Date().toISOString(),
      woodBatches: $woodBatches,
      woodMovements: $woodMovements,
      woodShortfalls: $woodShortfalls,
    })
  }
</script>

<svelte:head>
  <title>木料台账 · 木版年画刻版工序档案</title>
</svelte:head>

<div class="page-heading">
  <div>
    <p class="eyebrow">板料入库与领料</p>
    <h1>木料台账</h1>
    <p>登记批次、树种、厚度与入库张数；新画稿按最早合用批次领料，作废版片按原批退库或记损耗。</p>
  </div>
  <div class="heading-actions">
    <a class="button ghost" use:link href="/drafts">返回画稿总览</a>
    <button class="button ghost" type="button" onclick={exportWoodArchive}>导出台账</button>
    <button class="button primary" data-testid="new-woodbatch" type="button" onclick={openBatchForm}>木料入库</button>
  </div>
</div>

<section class="summary-strip four">
  <div><span>黄杨结存</span><strong data-testid="count-huangyang">{totalHuangyang}</strong><small>张（墨线版料）</small></div>
  <div><span>梨木结存</span><strong data-testid="count-limu">{totalLimu}</strong><small>张（套色版料）</small></div>
  <div><span>在册批次</span><strong>{$woodBatches.length}</strong></div>
  <div><span>未结缺口</span><strong data-testid="count-shortfall">{$woodShortfalls.length}</strong><small>条</small></div>
</section>

{#if showBatchForm}
  <section class="panel form-panel" data-testid="form-woodbatch">
    <div class="panel-heading">
      <div>
        <span class="section-kicker">新料入库</span>
        <h2>登记木料批次</h2>
      </div>
      <button class="text-button" type="button" onclick={() => (showBatchForm = false)}>收起</button>
    </div>

    <div class="form-grid three">
      <label>
        <span>批次编号</span>
        <input data-testid="field-wood-batchNo" bind:value={batchNo} placeholder="如：黄杨-2603" />
      </label>
      <label>
        <span>树种</span>
        <select data-testid="field-wood-woodType" value={woodType} onchange={(event) => changeWoodType((event.currentTarget as HTMLSelectElement).value as WoodType)}>
          <option value="黄杨">黄杨（墨线版）</option>
          <option value="梨木">梨木（套色版）</option>
        </select>
      </label>
      <label>
        <span>厚度（mm）</span>
        <input data-testid="field-wood-thickness" type="number" min="1" bind:value={thicknessMm} />
      </label>
      <label>
        <span>入库张数</span>
        <input data-testid="field-wood-qty" type="number" min="1" bind:value={receivedQty} />
      </label>
      <label>
        <span>入库日期</span>
        <input data-testid="field-wood-date" type="date" bind:value={receivedAt} />
      </label>
      <label class="wide">
        <span>来路与料性说明</span>
        <textarea data-testid="field-wood-note" rows="2" bind:value={supplierNote} placeholder="产地、阴干年限、适用版别"></textarea>
      </label>
    </div>

    {#if formMessage}<p class="form-message">{formMessage}</p>{/if}
    <div class="form-actions">
      <button class="button primary" data-testid="submit-woodbatch" type="button" onclick={submitBatch}>登记入库</button>
      <button class="button ghost" type="button" onclick={() => (showBatchForm = false)}>取消</button>
    </div>
  </section>
{/if}

<section class="filter-bar" aria-label="木料筛选">
  <label>
    <span>按树种</span>
    <select data-testid="filter-wood" bind:value={woodFilter}>
      <option value="全部">全部树种</option>
      <option value="黄杨">黄杨</option>
      <option value="梨木">梨木</option>
    </select>
  </label>
  <p>领料按同树种、同厚度、入库最早的批次依次出账。</p>
</section>

{#if filteredBatches.length === 0}
  <EmptyBox
    title="木料池还没有账"
    message="先登记黄杨、梨木批次（树种、厚度、入库张数），新立画稿时才能成套领料。"
    actionLabel="木料入库"
    onaction={openBatchForm}
  />
{:else}
  <section class="panel table-panel">
    <div class="panel-heading">
      <div>
        <span class="section-kicker">批次结存</span>
        <h2>木料批次台账</h2>
      </div>
    </div>
    <div class="table-scroll">
      <table class="data-table wood-table">
        <thead>
          <tr>
            <th>批次编号</th>
            <th>树种</th>
            <th>厚度</th>
            <th>入库</th>
            <th>结存</th>
            <th>入库日期</th>
            <th>来路与料性</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredBatches as batch (batch.id)}
            <tr data-testid="row-woodbatch" class:empty-stock={batch.remainingQty === 0}>
              <td><strong>{batch.batchNo}</strong></td>
              <td><span class="tag wood-{batch.woodType}">{batch.woodType}</span></td>
              <td>{batch.thicknessMm} mm</td>
              <td>{batch.receivedQty} 张</td>
              <td><strong class:stock-zero={batch.remainingQty === 0}>{batch.remainingQty} 张</strong></td>
              <td><small>{batch.receivedAt}</small></td>
              <td class="note-cell">{batch.supplierNote || '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{/if}

{#if $woodShortfalls.length > 0}
  <section class="panel shortfall-panel" data-testid="wood-shortfall-list">
    <div class="panel-heading">
      <div>
        <span class="section-kicker">领料缺口</span>
        <h2>木料不足、未建成的画稿</h2>
      </div>
      <strong>{$woodShortfalls.length} 条</strong>
    </div>
    <ul class="shortfall-list">
      {#each $woodShortfalls as item (item.id)}
        <li data-testid="row-wood-shortfall">
          <div>
            <strong>{item.draftTitle}</strong>
            <small>{formatTime(item.occurredAt)}</small>
          </div>
          <span class="tag shortfall-tag">{item.items.join('、')}</span>
          <p>{item.note}</p>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<section class="panel movement-panel">
  <div class="panel-heading">
    <div>
      <span class="section-kicker">木料流水</span>
      <h2>入库 · 领料 · 退库 · 损耗</h2>
    </div>
    <strong>{$woodMovements.length} 条</strong>
  </div>

  {#if $woodMovements.length === 0}
    <EmptyBox title="尚无流水" message="木料入库、画稿领料、作废退库或损耗都会在此留痕。" />
  {:else}
    <div class="table-scroll">
      <table class="data-table movement-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>事项</th>
            <th>批次</th>
            <th>树种 / 厚度</th>
            <th>数量</th>
            <th>关联版片与说明</th>
          </tr>
        </thead>
        <tbody>
          {#each $woodMovements as movement (movement.id)}
            <tr data-testid="row-woodmovement" class={movementClass(movement.movementType)}>
              <td><small>{formatTime(movement.occurredAt)}</small></td>
              <td><span class="tag movement-tag {movementClass(movement.movementType)}">{movement.movementType}</span></td>
              <td><strong>{movement.woodBatchNo}</strong></td>
              <td>{movement.woodType} · {movement.thicknessMm}mm</td>
              <td class="qty-cell">
                {movement.movementType === '入库' || movement.movementType === '退库' ? '+' : '-'}
                {movement.qty}
              </td>
              <td class="note-cell">
                {#if movement.blockId}<strong class="block-ref">{blockLabel(movement.blockId)}</strong>{/if}
                <span>{movement.refNote}</span>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<style>
  .wood-table {
    min-width: 56rem;
  }

  .movement-table {
    min-width: 60rem;
  }

  .wood-黄杨 {
    color: #fff;
    background: #6b5320;
  }

  .wood-梨木 {
    color: #fff;
    background: var(--gold);
  }

  .stock-zero {
    color: var(--cinnabar);
  }

  .empty-stock td {
    opacity: 0.62;
  }

  .note-cell {
    color: var(--ink-muted);
    line-height: 1.55;
  }

  .note-cell .block-ref {
    margin-right: 0.45rem;
    color: var(--ink-soft);
  }

  .qty-cell {
    font-weight: 800;
    white-space: nowrap;
  }

  .movement-入库 .qty-cell,
  .movement-退库 .qty-cell {
    color: var(--jade);
  }

  .movement-领料 .qty-cell,
  .movement-损耗 .qty-cell {
    color: var(--cinnabar);
  }

  .movement-tag.movement-入库,
  .movement-tag.movement-退库 {
    color: #fff;
    background: var(--jade);
  }

  .movement-tag.movement-领料 {
    color: #fff;
    background: var(--ink-soft);
  }

  .movement-tag.movement-损耗 {
    color: #fff;
    background: var(--cinnabar);
  }

  .shortfall-panel {
    margin-top: 1.5rem;
    border-color: rgba(169, 52, 39, 0.35);
  }

  .shortfall-list {
    display: grid;
    gap: 0.8rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .shortfall-list li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.3rem 1rem;
    padding: 0.85rem 1rem;
    border: 1px dashed var(--line-strong);
    border-radius: var(--radius-md);
    background: rgba(169, 52, 39, 0.05);
  }

  .shortfall-list small {
    margin-left: 0.6rem;
    color: var(--ink-muted);
  }

  .shortfall-tag {
    color: #fff;
    background: var(--cinnabar);
  }

  .shortfall-list p {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--ink-muted);
    font-size: 0.82rem;
    line-height: 1.6;
  }
</style>
