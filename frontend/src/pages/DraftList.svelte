<script lang="ts">
  import { onMount } from 'svelte'
  import { link } from 'svelte-spa-router'
  import ColorSwatch from '../components/common/ColorSwatch.svelte'
  import EmptyBox from '../components/common/EmptyBox.svelte'
  import { draftStore } from '../stores/draftStore'
  import { blockStore } from '../stores/blockStore'
  import { woodStore } from '../stores/woodStore'
  import { useBlockOrder } from '../hooks/useBlockOrder'
  import type { DraftGenre, DraftStatus, Draft } from '../types/draft'
  import type { PrintBatch } from '../types/batch'
  import type { WoodBatch, WoodShortfall } from '../types/wood'
  import { db } from '../utils/db'

  const { blocks: orderedBlocks, carvedRate } = useBlockOrder(null)
  const blockStats = blockStore.statsByDraft

  let genreFilter = $state<DraftGenre | '全部'>('全部')
  let statusFilter = $state<DraftStatus | '全部'>('全部')
  let showForm = $state(false)
  let title = $state('')
  let genre = $state<DraftGenre>('门神')
  let designer = $state('')
  let sizeCm = $state('')
  let paperNote = $state('')
  let status = $state<DraftStatus>('起稿')
  let lineThicknessMm = $state(18)
  let colorThicknessMm = $state(20)
  let formMessage = $state('')
  let batches = $state<PrintBatch[]>([])
  let woodBatches = $state<WoodBatch[]>([])
  let shortfalls = $state<WoodShortfall[]>([])

  const genres: DraftGenre[] = ['门神', '灶王', '戏出', '娃娃']
  const statuses: DraftStatus[] = ['起稿', '分版中', '刻版中', '可印']

  const lineThicknessOptions = $derived(
    [...new Set(woodBatches.filter((batch) => batch.woodType === '黄杨').map((batch) => batch.thicknessMm))].sort((a, b) => a - b),
  )
  const colorThicknessOptions = $derived(
    [...new Set(woodBatches.filter((batch) => batch.woodType === '梨木').map((batch) => batch.thicknessMm))].sort((a, b) => a - b),
  )

  function remainingBySpec(woodType: '黄杨' | '梨木', thicknessMm: number): number {
    return woodBatches
      .filter((batch) => batch.woodType === woodType && batch.thicknessMm === thicknessMm)
      .reduce((sum, batch) => sum + batch.remainingQty, 0)
  }

  const huangyangRemaining = $derived(
    woodBatches.filter((batch) => batch.woodType === '黄杨').reduce((sum, batch) => sum + batch.remainingQty, 0),
  )
  const limuRemaining = $derived(
    woodBatches.filter((batch) => batch.woodType === '梨木').reduce((sum, batch) => sum + batch.remainingQty, 0),
  )

  const filteredDrafts = $derived(
    $draftStore.filter((draft) => {
      const genreMatched = genreFilter === '全部' || draft.genre === genreFilter
      const statusMatched = statusFilter === '全部' || draft.status === statusFilter
      return genreMatched && statusMatched
    }),
  )

  const latestBatchByDraft = $derived.by(() => {
    const latest: Record<string, PrintBatch> = {}
    for (const batch of batches) {
      const current = latest[batch.draftId]
      if (!current || batch.printedAt > current.printedAt) latest[batch.draftId] = batch
    }
    return latest
  })

  onMount(() => {
    void Promise.all([draftStore.load(), blockStore.load(), refreshBatches(), refreshWood()])
  })

  async function refreshBatches(): Promise<void> {
    batches = await db.batches.toArray()
  }

  async function refreshWood(): Promise<void> {
    await woodStore.load()
    woodBatches = await db.woodBatches.toArray()
    shortfalls = await db.woodShortfalls.toArray()
    shortfalls.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    // 厚度选项若当前选择已不在台账，回落到首个可用规格
    if (lineThicknessOptions.length > 0 && !lineThicknessOptions.includes(lineThicknessMm)) {
      lineThicknessMm = lineThicknessOptions[0] ?? lineThicknessMm
    }
    if (colorThicknessOptions.length > 0 && !colorThicknessOptions.includes(colorThicknessMm)) {
      colorThicknessMm = colorThicknessOptions[0] ?? colorThicknessMm
    }
  }

  function firstBlockColor(draftId: string): number {
    const block = $orderedBlocks.find((item) => item.draftId === draftId)
    return block?.colorNo ?? 1
  }

  function openForm(): void {
    showForm = true
    formMessage = ''
    if (lineThicknessOptions.length > 0) lineThicknessMm = lineThicknessOptions[0] ?? 18
    if (colorThicknessOptions.length > 0) colorThicknessMm = colorThicknessOptions[0] ?? 20
  }

  async function submitDraft(): Promise<void> {
    if (!title.trim() || !designer.trim() || !sizeCm.trim()) {
      formMessage = '请补全画题、起稿人和画心尺寸。'
      return
    }

    const result = await woodStore.createDraftWithBlocks({
      title: title.trim(),
      genre,
      designer: designer.trim(),
      sizeCm: sizeCm.trim(),
      paperNote: paperNote.trim() || '待选纸后补充',
      status,
      lineThicknessMm: Number(lineThicknessMm),
      colorThicknessMm: Number(colorThicknessMm),
    })

    if (!result.ok) {
      await Promise.all([refreshWood(), draftStore.load(), blockStore.load()])
      formMessage = `木料不足，已登记缺口（${result.shortfallItems.join('、')}）；未建立画稿与版片，请先到木料台账补料。`
      return
    }

    await Promise.all([draftStore.load(), blockStore.load(), refreshWood()])
    draftStore.select(result.draftId ?? null)

    title = ''
    genre = '门神'
    designer = ''
    sizeCm = ''
    paperNote = ''
    status = '起稿'
    formMessage = ''
    showForm = false
  }

  function genreClass(value: DraftGenre): string {
    return `genre-${genres.indexOf(value)}`
  }

  function statusClass(value: DraftStatus): string {
    return `status-${statuses.indexOf(value)}`
  }

  function draftCardData(draft: Draft) {
    return {
      stats: $blockStats[draft.id] ?? { total: 0, carved: 0, rate: 0 },
      batch: latestBatchByDraft[draft.id],
    }
  }
</script>

<svelte:head>
  <title>画稿总览 · 木版年画刻版工序档案</title>
</svelte:head>

<div class="page-heading">
  <div>
    <p class="eyebrow">画稿与分版</p>
    <h1>画稿总览</h1>
    <p>掌握每张年画的题材、分版进度与最近试印记录。</p>
  </div>
  <div class="heading-actions">
    <a class="button ghost" use:link href="/wood" data-testid="goto-wood">木料台账</a>
    <button class="button primary" data-testid="new-draft" type="button" onclick={openForm}>新建画稿</button>
  </div>
</div>

<section class="summary-strip" aria-label="档案概况">
  <div><span>在册画稿</span><strong data-testid="count-draft">{$draftStore.length}</strong></div>
  <div><span>全馆版片</span><strong>{$orderedBlocks.length}</strong></div>
  <div><span>黄杨结存</span><strong data-testid="count-huangyang">{huangyangRemaining}</strong><small>张</small></div>
  <div><span>梨木结存</span><strong data-testid="count-limu">{limuRemaining}</strong><small>张</small></div>
  <div><span>登记批次</span><strong>{batches.length}</strong></div>
</section>

{#if showForm}
  <section class="panel form-panel" data-testid="form-draft">
    <div class="panel-heading">
      <div>
        <span class="section-kicker">新立画稿</span>
        <h2>登记画心与起稿信息</h2>
      </div>
      <button class="text-button" type="button" onclick={() => (showForm = false)}>收起</button>
    </div>

    <div class="form-grid">
      <label>
        <span>画题</span>
        <input data-testid="field-title" bind:value={title} placeholder="如：五子夺莲" />
      </label>
      <label>
        <span>题材</span>
        <select data-testid="field-genre" bind:value={genre}>
          {#each genres as item}<option value={item}>{item}</option>{/each}
        </select>
      </label>
      <label>
        <span>起稿人</span>
        <input data-testid="field-designer" bind:value={designer} placeholder="填写画师或画坊" />
      </label>
      <label>
        <span>画心尺寸</span>
        <input data-testid="field-sizeCm" bind:value={sizeCm} placeholder="如：45 × 32 cm" />
      </label>
      <label class="wide">
        <span>用纸说明</span>
        <textarea data-testid="field-paperNote" bind:value={paperNote} rows="2" placeholder="纸名、纸质与托裱方式"></textarea>
      </label>
      <label>
        <span>当前状态</span>
        <select data-testid="field-status" bind:value={status}>
          {#each statuses as item}<option value={item}>{item}</option>{/each}
        </select>
      </label>
      <label>
        <span>墨线版厚（黄杨）</span>
        <select data-testid="field-lineThickness" bind:value={lineThicknessMm}>
          {#each lineThicknessOptions as item}<option value={item}>{item} mm（结存 {remainingBySpec('黄杨', item)} 张）</option>{/each}
        </select>
      </label>
      <label>
        <span>套色版厚（梨木）</span>
        <select data-testid="field-colorThickness" bind:value={colorThicknessMm}>
          {#each colorThicknessOptions as item}<option value={item}>{item} mm（结存 {remainingBySpec('梨木', item)} 张）</option>{/each}
        </select>
      </label>
    </div>

    <p class="stock-hint" data-testid="wood-requirement">
      新稿一次开四块版：墨线版领黄杨 1 张、其余三块领梨木，按入库先后从最早合用批次领料；
      当前规格需黄杨 {remainingBySpec('黄杨', lineThicknessMm)} 张可用、梨木 {remainingBySpec('梨木', colorThicknessMm)} 张可用，缺料只记缺口、不留半套记录。
    </p>

    {#if formMessage}<p class="form-message">{formMessage}</p>{/if}
    <div class="form-actions">
      <button class="button primary" data-testid="submit-draft" type="button" onclick={submitDraft}>保存画稿</button>
      <button class="button ghost" type="button" onclick={() => (showForm = false)}>取消</button>
    </div>
  </section>
{/if}

<section class="filter-bar" aria-label="画稿筛选">
  <label>
    <span>按题材</span>
    <select data-testid="filter-genre" bind:value={genreFilter}>
      <option value="全部">全部题材</option>
      {#each genres as item}<option value={item}>{item}</option>{/each}
    </select>
  </label>
  <label>
    <span>按状态</span>
    <select data-testid="filter-status" bind:value={statusFilter}>
      <option value="全部">全部状态</option>
      {#each statuses as item}<option value={item}>{item}</option>{/each}
    </select>
  </label>
  <p>当前显示 {filteredDrafts.length} 张画稿</p>
</section>

{#if filteredDrafts.length === 0}
  <EmptyBox
    title="这一筛选中暂无画稿"
    message="调整题材或状态，或先登记一张新画稿，再进入分版编排。"
    actionLabel="新建画稿"
    onaction={openForm}
  />
{:else}
  <section class="card-grid">
    {#each filteredDrafts as draft (draft.id)}
      {@const data = draftCardData(draft)}
      <article class="draft-card" data-testid="row-draft">
        <div class="card-topline">
          <span class="tag genre-tag {genreClass(draft.genre)}">
            {draft.genre}
          </span>
          <span class="tag status-tag {statusClass(draft.status)}">{draft.status}</span>
        </div>

        <div class="title-line">
          <ColorSwatch colorNo={firstBlockColor(draft.id)} />
          <h2>{draft.title}</h2>
        </div>

        <dl class="meta-list">
          <div><dt>起稿</dt><dd>{draft.designer}</dd></div>
          <div><dt>画心</dt><dd>{draft.sizeCm}</dd></div>
          <div><dt>用纸</dt><dd>{draft.paperNote}</dd></div>
        </dl>

        <div class="progress-block">
          <div class="progress-label"><span>版片进度</span><strong>{data.stats.carved}/{data.stats.total}</strong></div>
          <div class="progress-track"><i style={`width: ${data.stats.rate}%`}></i></div>
          <small>刻成率 {data.stats.rate}%</small>
        </div>

        <div class="latest-batch">
          <span>最近批次</span>
          {#if data.batch}
            <strong>{data.batch.batchNo}</strong>
            <small>{data.batch.printedAt.replace(/-/g, '.')} · 印 {data.batch.qty} 张</small>
          {:else}
            <strong>尚未试印</strong>
            <small>版片齐备后可登记首批</small>
          {/if}
        </div>

        <a class="button secondary" use:link href={`/drafts/${draft.id}/blocks`}>进入版片编排台</a>
      </article>
    {/each}
  </section>
{/if}

{#if shortfalls.length > 0}
  <section class="panel shortfall-panel" data-testid="shortfall-list">
    <div class="panel-heading">
      <div>
        <span class="section-kicker">木料缺口</span>
        <h2>未成套的领料缺口</h2>
      </div>
      <a class="text-button" use:link href="/wood" data-testid="goto-wood-shortfall">去木料台账补料</a>
    </div>
    <ul class="shortfall-list">
      {#each shortfalls as item (item.id)}
        <li data-testid="row-shortfall">
          <div>
            <strong>{item.draftTitle}</strong>
            <small>{item.occurredAt.replace('T', ' ')}</small>
          </div>
          <span class="tag shortfall-tag">{item.items.join('、')}</span>
          <p>{item.note}</p>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .heading-actions {
    display: flex;
    gap: 0.75rem;
  }

  .stock-hint {
    margin: 1rem 0 0;
    padding: 0.65rem 0.8rem;
    border-left: 3px solid var(--gold);
    border-radius: var(--radius-sm);
    background: rgba(187, 132, 45, 0.08);
    color: var(--ink-soft);
    font-size: 0.82rem;
    line-height: 1.65;
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

  .shortfall-list strong {
    font-size: 0.92rem;
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
