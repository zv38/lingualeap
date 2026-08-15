export interface SearchResult {
  title: string
  url: string
  snippet: string
}

export async function webSearch(query: string): Promise<{ results: SearchResult[]; summary?: string }> {
  const response = await fetch('/api/ai/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })

  const result = await response.json()

  if (!response.ok || !result.success) {
    throw new Error(result.message || `搜索请求失败 (${response.status})`)
  }

  return { results: result.results || [], summary: result.summary }
}