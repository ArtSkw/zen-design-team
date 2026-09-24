import { House, Minus, Plus, RotateCcw, RotateCw, type LucideIcon } from 'lucide-react'
import { view } from '../scene/view'

// Bottom-centre cluster: home first, then rotate and zoom. Quiet glass pills, no
// labels; Lucide icons (2 px round strokes, like the loader and the DS line work).
function Btn({ label, icon: Icon, onClick }: { label: string; icon: LucideIcon; onClick: () => void }) {
  return (
    <button type="button" className="vc__btn" aria-label={label} title={label} onClick={onClick}>
      <Icon size={20} aria-hidden="true" />
    </button>
  )
}

export function ViewControls() {
  return (
    <div className="vc" role="group" aria-label="Widok">
      <div className="vc__group">
        <Btn label="Widok początkowy" icon={House} onClick={() => view.reset()} />
      </div>
      <div className="vc__group">
        <Btn label="Obróć w lewo" icon={RotateCcw} onClick={() => view.rotate(-0.42)} />
        <Btn label="Obróć w prawo" icon={RotateCw} onClick={() => view.rotate(0.42)} />
      </div>
      <div className="vc__group">
        <Btn label="Przybliż" icon={Plus} onClick={() => view.zoom(0.8)} />
        <Btn label="Oddal" icon={Minus} onClick={() => view.zoom(1.25)} />
      </div>
    </div>
  )
}
