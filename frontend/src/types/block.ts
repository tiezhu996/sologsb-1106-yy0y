export type BlockName = '墨线版' | '黄版' | '红版' | '绿版'
export type WoodType = '梨木' | '黄杨'
export type BlockState = '待刻' | '在刻' | '已刻成' | '已修版' | '已作废'
export type ScrapMode = '退库' | '损耗'

export interface Block {
  id: string
  draftId: string
  blockName: BlockName
  colorNo: number
  woodType: WoodType
  thicknessMm: number
  woodBatchId?: string
  legacy?: boolean
  carvedBy: string
  state: BlockState
  defectNote: string
  scrappedAt?: string
  scrapMode?: ScrapMode
  scrapNote?: string
}
