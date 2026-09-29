<script lang="ts">
  import { onMount } from 'svelte'
  import EmptyBox from '../components/common/EmptyBox.svelte'
  import { woodStore } from '../stores/woodStore'
  import { remainingSheets } from '../utils/wood'
  import type { WoodType } from '../types/block'

  let showForm = $state(false)
  let batchNo = $state('')
  let woodType = $state<WoodType>('黄杨')
  let thicknessMm = $state(18)
  let totalSheets = $state(10)
  let stockedAt = $state(new Date().toISOString().slice(0, 10))
  let supplier = $state('')
  let note = $state('')
  let formMessage = $state('')

  const woodTypes: WoodType[] = ['黄杨', '梨木']

  const stock = woodStore.stockByType
  const batches = woodStore
  const shortages = woodStore.shortages

  const totalIn = $derived($batches.reduce((sum, batch) => sum + batch.totalSheets, 0))
  const totalUsed = $derived($batches.reduce((sum, batch) => sum + batch.usedSheets, 0))

  onMount(() => {
    void woodStore.load()
  })

  function openForm(): void {
    showForm = true
    formMessage = ''
  }

  async function submitBatch(): Promise<void> {
    if (!batchNo.trim() || totalSheets <= 0) {
      formMessage = '请补全批次号与入库张数。'
      return
    }
    await woodStore.createBatch({
      batchNo: batchNo.trim(),
      woodType,
      thicknessMm: Number(thicknessMm),
      totalSheets: Number(totalSheets),
      stockedAt,
      supplier: supplier.trim() || '待补来源',
      note: note.trim() || '—',
    })
    batchNo = ''
    supplier = ''
    note = ''
    totalSheets = 10
    formMessage = ''
    showForm = false
  }
</script>

<svelte:head>
  <title>木料台账 · 木版年画刻版工序档案</title>
</svelte:head>

<div class="page-heading">
  <div>
    <p class="eyebrow">木料池出入库</p>
    <h1>木料台账</h1>
    <p>登记各批次树种、厚度与入库张数，新画稿按用料从最早批次领料。</p>
  </div>
  <div class="heading-actions">
    <button class="button primary" data-testid="new-wood-batch" type="button" onclick={openForm}>登记入库</button>
  </div>
</div>

<section class="summary-strip four">
  <div><span>黄杨剩余</span><strong data-testid="stock-huangyang">{$stock.黄杨.remaining}</strong><small>张 · 供墨线版</small></div>
  <div><span>梨木剩余</span><strong data-testid="stock-limu">{$stock.梨木.remaining}</strong><small>张 · 供套色版</small></div>
  <div><span>累计入库</span><strong>{totalIn}</strong><small>张</small></div>
  <div><span>累计领用</span><strong>{totalUsed}</strong><small>张</small></div>
</section>

{#if showForm}
  <section class="panel form-panel" data-testid="form-wood-batch">
    <div class="panel-heading">
      <div>
        <span class="section-kicker">新入库</span>
        <h2>登记木料批次</h2>
      </div>
      <button class="text-button" type="button" onclick={() => (showForm = false)}>收起</button>
    </div>
    <div class="form-grid three">
      <label>
        <span>批次号</span>
        <input data-testid="field-wood-batchNo" bind:value={batchNo} placeholder="如：黄杨-2603" />
      </label>
      <label>
        <span>树种</span>
        <select data-testid="field-wood-type" bind:value={woodType}>
          {#each woodTypes as item}<option value={item}>{item}</option>{/each}
        </select>
      </label>
      <label>
        <span>厚度（mm）</span>
        <input data-testid="field-wood-thickness" type="number" min="1" bind:value={thicknessMm} />
      </label>
      <label>
        <span>入库张数</span>
        <input data-testid="field-wood-total" type="number" min="1" bind:value={totalSheets} />
      </label>
      <label>
        <span>入库日期</span>
        <input data-testid="field-wood-stockedAt" type="date" bind:value={stockedAt} />
      </label>
      <label>
        <span>来源</span>
        <input data-testid="field-wood-supplier" bind:value={supplier} placeholder="木料行或产地" />
      </label>
      <label class="wide">
        <span>备注</span>
        <textarea data-testid="field-wood-note" rows="2" bind:value={note} placeholder="干燥情况、纹理与用途说明"></textarea>
      </label>
    </div>
    {#if formMessage}<p class="form-message">{formMessage}</p>{/if}
    <div class="form-actions">
      <button class="button primary" data-testid="submit-wood-batch" type="button" onclick={submitBatch}>保存入库</button>
      <button class="button ghost" type="button" onclick={() => (showForm = false)}>取消</button>
    </div>
  </section>
{/if}

<section class="panel">
  <div class="panel-heading">
    <div>
      <span class="section-kicker">库存批次</span>
      <h2>木料池台账</h2>
    </div>
    <span class="sync-note">按入库日期先后领料</span>
  </div>

  {#if $batches.length === 0}
    <EmptyBox title="木料池尚无批次" message="先登记入库批次，新画稿才能按料领料开版。" actionLabel="登记入库" onaction={openForm} />
  {:else}
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>批次号</th>
            <th>树种</th>
            <th>厚度</th>
            <th>入库</th>
            <th>领用</th>
            <th>剩余</th>
            <th>入库日期</th>
            <th>来源</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          {#each $batches as batch (batch.id)}
            <tr data-testid="row-wood-batch">
              <td><strong>{batch.batchNo}</strong></td>
              <td>
                <span class="tag">{batch.woodType}</span>
              </td>
              <td>{batch.thicknessMm} mm</td>
              <td>{batch.totalSheets}</td>
              <td>{batch.usedSheets}</td>
              <td>
                <strong class:low-stock={remainingSheets(batch) === 0}>{remainingSheets(batch)}</strong>
              </td>
              <td>{batch.stockedAt}</td>
              <td>{batch.supplier}</td>
              <td class="note-cell">{batch.note}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<section class="panel">
  <div class="panel-heading">
    <div>
      <span class="section-kicker">领料缺口</span>
      <h2>缺口登记</h2>
    </div>
    <span class="sync-note">木料不足时只记账、不开版</span>
  </div>

  {#if $shortages.length === 0}
    <p class="gentle-copy">暂无缺口记录。新画稿领料不足时，会在此登记缺额，且不留半套版片。</p>
  {:else}
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th>画稿</th>
            <th>树种</th>
            <th>厚度</th>
            <th>需用</th>
            <th>可领</th>
            <th>缺口</th>
            <th>登记日期</th>
          </tr>
        </thead>
        <tbody>
          {#each $shortages as shortage (shortage.id)}
            <tr data-testid="row-shortage">
              <td><strong>{shortage.draftTitle}</strong></td>
              <td><span class="tag">{shortage.woodType}</span></td>
              <td>{shortage.thicknessMm} mm</td>
              <td>{shortage.required}</td>
              <td>{shortage.available}</td>
              <td><strong class="low-stock">{shortage.missing}</strong></td>
              <td>{shortage.reportedAt}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<style>
  .low-stock {
    color: var(--cinnabar);
  }

  .note-cell {
    color: var(--ink-muted);
    font-size: 0.8rem;
    max-width: 16rem;
  }
</style>
