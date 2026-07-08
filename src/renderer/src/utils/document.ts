export const getTagsArray = (tagsStr: string | null): string[] => {
  if (!tagsStr) return []
  try {
    const parsed = JSON.parse(tagsStr)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return tagsStr
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
  }
}
