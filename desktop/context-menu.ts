/**
 * Pure template builder for the native right-click menu. Kept free of electron
 * imports so it can be unit-tested under vitest (same pattern as update-state.ts);
 * main.ts turns the template into a real Menu via Menu.buildFromTemplate.
 */

export interface ContextMenuEditFlags {
  canCut: boolean
  canCopy: boolean
  canPaste: boolean
  canSelectAll: boolean
}

export interface ContextMenuParams {
  isEditable: boolean
  selectionText: string
  editFlags: ContextMenuEditFlags
}

export interface ContextMenuTemplateItem {
  role?: 'cut' | 'copy' | 'paste' | 'selectAll'
  type?: 'separator'
  enabled?: boolean
}

/**
 * Builds a minimal cut/copy/paste menu from Electron `context-menu` event params.
 * Returns [] when there is nothing relevant (not editable and no selection),
 * so callers can skip showing a menu entirely.
 */
export function buildContextMenuTemplate(params: ContextMenuParams): ContextMenuTemplateItem[] {
  const hasSelection = params.selectionText.trim().length > 0
  if (!params.isEditable && !hasSelection) return []

  const items: ContextMenuTemplateItem[] = []
  if (params.isEditable) {
    items.push({ role: 'cut', enabled: params.editFlags.canCut })
  }
  items.push({ role: 'copy', enabled: params.editFlags.canCopy })
  if (params.isEditable) {
    items.push({ role: 'paste', enabled: params.editFlags.canPaste })
    items.push({ type: 'separator' })
    items.push({ role: 'selectAll', enabled: params.editFlags.canSelectAll })
  }
  return items
}
