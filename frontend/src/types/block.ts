export type BlockName = '墨线版' | '黄版' | '红版' | '绿版'
export type WoodType = '梨木' | '黄杨'
export type BlockState = '待刻' | '在刻' | '已刻成' | '已修版' | '已作废'
/** 木料来源：在册批次 / 历史旧版无批号 */
export type BlockSourceKind = '批次' | '历史无编号'

export interface Block {
  id: string
  draftId: string
  blockName: BlockName
  colorNo: number
  woodType: WoodType
  thicknessMm: number
  carvedBy: string
  state: BlockState
  defectNote: string
  /** 木料来源批次（历史旧版补登前为空） */
  sourceKind?: BlockSourceKind
  sourceBatchId?: string
  sourceBatchNo?: string
}
