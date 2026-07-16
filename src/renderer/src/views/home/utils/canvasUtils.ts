/* ──────────── Tag parser ──────────── */

export function parseTags(tagsStr: string | null): string[] {
  if (!tagsStr) return []
  try {
    const allTags = new Set<string>()
    const parsed = JSON.parse('[' + tagsStr + ']')
    if (Array.isArray(parsed)) {
      parsed.forEach((item) => {
        if (Array.isArray(item)) item.forEach((tag: string) => allTags.add(tag))
      })
    }
    return Array.from(allTags).slice(0, 3)
  } catch {
    return []
  }
}

/* ──────────── Date formatter ──────────── */

export function formatDueDate(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
