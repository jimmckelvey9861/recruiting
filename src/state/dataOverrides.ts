import { useSyncExternalStore } from 'react'

type OverrideKey = string

interface OverrideValue {
  demand: number
  supply: number
}

const overrides = new Map<OverrideKey, OverrideValue>()

let overrideVersion = 0
const listeners = new Set<() => void>()

const emit = () => {
  overrideVersion += 1
  listeners.forEach((listener) => listener())
}

const keyOf = (role: string, weekOffset: number, dayIdx: number, slotIdx: number): OverrideKey =>
  `${role}::${weekOffset}::${dayIdx}::${slotIdx}`

const clampNumber = (value: number): number => {
  if (!Number.isFinite(value)) return 0
  const rounded = Math.round(value)
  return rounded < 0 ? 0 : rounded
}

export function getOverride(role: string, weekOffset: number, dayIdx: number, slotIdx: number): OverrideValue | undefined {
  return overrides.get(keyOf(role, weekOffset, dayIdx, slotIdx))
}

export function setOverride(
  role: string,
  weekOffset: number,
  dayIdx: number,
  slotIdx: number,
  value: { demand: number; supply: number }
): void {
  const demand = clampNumber(value.demand)
  const supply = clampNumber(value.supply)
  const key = keyOf(role, weekOffset, dayIdx, slotIdx)
  const existing = overrides.get(key)

  if (demand === 0 && supply === 0) {
    if (overrides.delete(key)) {
      emit()
    }
    return
  }

  if (existing && existing.demand === demand && existing.supply === supply) return
  overrides.set(key, { demand, supply })
  emit()
}

export function clearOverride(role: string, weekOffset: number, dayIdx: number, slotIdx: number): void {
  if (overrides.delete(keyOf(role, weekOffset, dayIdx, slotIdx))) {
    emit()
  }
}

export function clearRoleWeekOverrides(role: string, weekOffset: number): void {
  const prefix = `${role}::${weekOffset}::`
  let removed = false
  for (const key of Array.from(overrides.keys())) {
    if (key.startsWith(prefix)) {
      overrides.delete(key)
      removed = true
    }
  }
  if (removed) emit()
}

export function clearRoleOverrides(role: string): void {
  const prefix = `${role}::`
  let removed = false
  for (const key of Array.from(overrides.keys())) {
    if (key.startsWith(prefix)) {
      overrides.delete(key)
      removed = true
    }
  }
  if (removed) emit()
}

export function hasOverride(role: string, weekOffset: number, dayIdx: number, slotIdx: number): boolean {
  return overrides.has(keyOf(role, weekOffset, dayIdx, slotIdx))
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getSnapshot = () => overrideVersion

export function useOverrideVersion(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
