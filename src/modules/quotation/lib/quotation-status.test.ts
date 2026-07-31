import { describe, expect, it } from 'vitest'
import { displayStatus, isEditable, isShareable } from './quotation-status'

const NOW = new Date('2026-07-28T12:00:00Z')
const KEMARIN = new Date('2026-07-27T12:00:00Z')
const BESOK = new Date('2026-07-29T12:00:00Z')

describe('displayStatus', () => {
  it('menandai penawaran terkirim yang lewat masa berlaku sebagai kedaluwarsa', () => {
    expect(displayStatus('SENT', KEMARIN, NOW)).toBe('EXPIRED')
  })

  it('membiarkan penawaran yang masih berlaku tetap terkirim', () => {
    expect(displayStatus('SENT', BESOK, NOW)).toBe('SENT')
  })

  it('tidak mengubah hasil yang sudah final', () => {
    expect(displayStatus('WON', KEMARIN, NOW)).toBe('WON')
    expect(displayStatus('LOST', KEMARIN, NOW)).toBe('LOST')
  })

  it('tidak membuat draft kedaluwarsa', () => {
    expect(displayStatus('DRAFT', KEMARIN, NOW)).toBe('DRAFT')
    expect(displayStatus('DRAFT', null, NOW)).toBe('DRAFT')
  })

  it('menangani penawaran tanpa masa berlaku', () => {
    expect(displayStatus('SENT', null, NOW)).toBe('SENT')
    expect(displayStatus('SENT', undefined, NOW)).toBe('SENT')
  })

  it('memperlakukan batas waktu tepat sebagai belum kedaluwarsa', () => {
    expect(displayStatus('SENT', NOW, NOW)).toBe('SENT')
  })
})

describe('isEditable', () => {
  it('hanya mengizinkan draft diubah', () => {
    expect(isEditable('DRAFT')).toBe(true)
    expect(isEditable('SENT')).toBe(false)
    expect(isEditable('WON')).toBe(false)
    expect(isEditable('LOST')).toBe(false)
  })
})

describe('isShareable', () => {
  it('tidak pernah membagikan draft', () => {
    expect(isShareable('DRAFT')).toBe(false)
    expect(isShareable('SENT')).toBe(true)
    expect(isShareable('WON')).toBe(true)
  })
})
