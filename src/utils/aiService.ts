interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface AIResponse {
  success: boolean
  content?: string
  error?: string
}

export async function sendChatMessage(messages: ChatMessage[]): Promise<AIResponse> {
  try {
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    })

    const result = await response.json()

    if (!response.ok || !result.success) {
      return { success: false, error: result.message || `请求失败 (${response.status})` }
    }

    return {
      success: true,
      content: result.data?.choices?.[0]?.message?.content || '抱歉，我没有理解你的问题，请再描述一下。',
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '网络请求失败，请检查后端服务是否运行',
    }
  }
}