import DraftList from '../pages/DraftList.svelte'
import BlockBoard from '../pages/BlockBoard.svelte'
import NodeTimeline from '../pages/NodeTimeline.svelte'
import BatchList from '../pages/BatchList.svelte'
import CarverList from '../pages/CarverList.svelte'
import WoodLedger from '../pages/WoodLedger.svelte'

export const routes = {
  '/drafts': DraftList,
  '/drafts/:id/blocks': BlockBoard,
  '/blocks/:id/nodes': NodeTimeline,
  '/batches': BatchList,
  '/carvers': CarverList,
  '/wood': WoodLedger,
  '*': DraftList,
}

export default routes
