import { describe, expect, it } from 'vitest'
import { buildContextMenuTemplate, type ContextMenuParams } from '../../desktop/context-menu'

function params(overrides: Partial<ContextMenuParams> = {}): ContextMenuParams {
  return {
    isEditable: false,
    selectionText: '',
    editFlags: { canCut: false, canCopy: false, canPaste: false, canSelectAll: false },
    ...overrides,
  }
}

describe('buildContextMenuTemplate', () => {
  it('returns an empty template when there is no selection and nothing editable', () => {
    expect(buildContextMenuTemplate(params())).toEqual([])
  })

  it('offers only Copy for a selection in read-only prose', () => {
    const template = buildContextMenuTemplate(params({
      selectionText: 'a line of prose',
      editFlags: { canCut: false, canCopy: true, canPaste: false, canSelectAll: true },
    }))
    expect(template).toEqual([{ role: 'copy', enabled: true }])
  })

  it('offers Cut/Copy/Paste/Select All in an editable field with a selection', () => {
    const template = buildContextMenuTemplate(params({
      isEditable: true,
      selectionText: 'draft text',
      editFlags: { canCut: true, canCopy: true, canPaste: true, canSelectAll: true },
    }))
    expect(template).toEqual([
      { role: 'cut', enabled: true },
      { role: 'copy', enabled: true },
      { role: 'paste', enabled: true },
      { type: 'separator' },
      { role: 'selectAll', enabled: true },
    ])
  })

  it('respects editFlags in an editable field without a selection', () => {
    const template = buildContextMenuTemplate(params({
      isEditable: true,
      editFlags: { canCut: false, canCopy: false, canPaste: true, canSelectAll: true },
    }))
    expect(template).toEqual([
      { role: 'cut', enabled: false },
      { role: 'copy', enabled: false },
      { role: 'paste', enabled: true },
      { type: 'separator' },
      { role: 'selectAll', enabled: true },
    ])
  })

  it('treats whitespace-only selection outside editable fields as no selection', () => {
    expect(buildContextMenuTemplate(params({ selectionText: '  \n ' }))).toEqual([])
  })
})
