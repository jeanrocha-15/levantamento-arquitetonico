import { createContext, useContext, useEffect, useState } from 'react'
import type { InputHTMLAttributes, Ref } from 'react'
import { displayMeasurementInput, inputMeasurement, parseMeasurement, formatMeasurement } from './units'
import type { MeasurementUnit } from './units'
export const UnitContext = createContext<MeasurementUnit>('m')
export function useMeasurements() {
  const unit = useContext(UnitContext)
  return { unit, format: (value: number | null | undefined, suffix = true) => formatMeasurement(value, unit, suffix) }
}
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | null | undefined; onValue: (value: number | null) => void; ref?: Ref<HTMLInputElement>
}
export function MeasurementInput({ value, onValue, onFocus, onBlur, ...props }: Props) {
  const { unit } = useMeasurements()
  const [draft, setDraft] = useState(() => inputMeasurement(value, unit))
  const [editing, setEditing] = useState(false)
  useEffect(() => { setDraft(current => Object.is(parseMeasurement(current, unit), value) ? current : inputMeasurement(value, unit)) }, [value, unit])
  // Fora de edição, o campo mostra o padrão brasileiro ("2,80"); o texto digitado só é reinterpretado ao editar.
  const shown = !editing && value != null && Number.isFinite(value) && Object.is(parseMeasurement(draft, unit), value) ? displayMeasurementInput(value, unit) : draft
  return <input {...props} type="text" inputMode="decimal" value={shown} onFocus={event => { setEditing(true); onFocus?.(event) }} onBlur={event => { setEditing(false); onBlur?.(event) }} onChange={event => {
    setDraft(event.target.value); onValue(parseMeasurement(event.target.value, unit))
  }}/>
}
