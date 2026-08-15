import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, Heart, Send, Plus, Bot, Sparkles, X, User, Shield } from 'lucide-react'
import InlineLoading from '../components/ui/InlineLoading'
import { useStore } from '../store/useStore'
import UserAvatar from '../components/UserAvatar'
import { post } from '../utils/api'
import { staggerContainer, staggerItem, buttonTap, chatMessage, pageEnter } from '../utils/animations'
import Tooltip from '../components/Tooltip'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const Community = () => {
  const { posts, user, addPost, addComment, likePost, privacyAgreed } = useStore()
  const [newPost, setNewPost] = useState('')
  const [selectedLanguage, setSelectedLanguage] = useState('english')
  const [aiOpen, setAiOpen] = useState(false)
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: '你好！我是 LinguaLeap AI 助手，可以帮你解答语言学习问题、翻译句子、解释语法等。有什么可以帮你的吗？' }
  ])
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiReplyPost, setAiReplyPost] = useState<string | null>(null)
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({})
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aiMessages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!privacyAgreed) {
      alert('请先同意隐私协议书后再发布内容')
      return
    }
    if (newPost.trim() && user) {
      addPost({
        userId: user.id,
        username: user.username,
        avatar: user.avatar,
        content: newPost.trim(),
        language: selectedLanguage,
      })
      setNewPost('')
      ;(window as any).toast('发布成功', 'success')
    }
  }

  const handleReply = (postId: string) => {
    if (!privacyAgreed) {
      alert('请先同意隐私协议书后再回复')
      return
    }
    const content = replyInputs[postId]?.trim()
    if (!content || !user) return
    addComment(postId, {
      userId: user.id,
      username: user.username,
      content,
    })
    setReplyInputs(prev => ({ ...prev, [postId]: '' }))
    ;(window as any).toast('回复成功', 'success')
  }

  const handleLike = (postId: string) => {
    likePost(postId)
    ;(window as any).toast('点赞成功', 'success')
  }

  const handleAiChat = async (content: string) => {
    const userMsg: ChatMessage = { role: 'user', content }
    setAiMessages(prev => [...prev, userMsg])
    setAiInput('')
    setAiLoading(true)

    try {
      const res = await post('/ai/chat', {
        messages: [
          { role: 'system', content: '你是一个专业的语言学习助手，名叫 LinguaLeap AI。你擅长解答英语、日语、韩语等语言学习问题，包括语法解释、单词用法、翻译、发音指导等。请用中文回答，回答简洁实用，适当使用例子说明。' },
          ...aiMessages.filter(m => m.role === 'user').slice(-6).map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content }
        ],
        temperature: 0.7,
        max_tokens: 800,
      })

      if (res.success && res.data?.choices?.[0]?.message?.content) {
        setAiMessages(prev => [...prev, { role: 'assistant', content: res.data.choices[0].message.content }])
      } else {
        setAiMessages(prev => [...prev, { role: 'assistant', content: '抱歉，我暂时无法回答这个问题。请稍后再试。' }])
      }
    } catch {
      setAiMessages(prev => [...prev, { role: 'assistant', content: '网络连接失败，请检查网络后重试。' }])
    } finally {
      setAiLoading(false)
    }
  }

  const handleAiReply = async (postId: string, postContent: string) => {
    setAiReplyPost(postId)
    try {
      const res = await post('/ai/chat', {
        messages: [
          { role: 'system', content: '你是一个语言学习社区的AI助手。请对用户的帖子内容进行有建设性的回复，提供鼓励、建议或补充知识。回复要简短友好（50字以内），用中文。' },
          { role: 'user', content: `请回复这个帖子：${postContent}` }
        ],
        temperature: 0.7,
        max_tokens: 200,
      })

      if (res.success && res.data?.choices?.[0]?.message?.content) {
        const reply = res.data.choices[0].message.content
        addComment(postId, {
          userId: 'ai',
          username: 'AI助手',
          content: reply,
        })
        ;(window as any).toast('AI回复完成', 'success')
      } else {
        addComment(postId, {
          userId: 'ai',
          username: 'AI助手',
          content: '加油！继续坚持学习，你一定能取得进步！💪',
        })
      }
    } catch {
      ;(window as any).toast('操作失败', 'error')
      addComment(postId, {
        userId: 'ai',
        username: 'AI助手',
        content: '加油！继续坚持学习，你一定能取得进步！💪',
      })
    } finally {
      setAiReplyPost(null)
    }
  }

  const languages = [
    { code: 'english', name: '英语', flag: '🇺🇸' },
    { code: 'japanese', name: '日语', flag: '🇯🇵' },
    { code: 'korean', name: '韩语', flag: '🇰🇷' },
  ]

  const languageLabel = (lang: string) => {
    if (lang === 'english') return '🇺🇸 英语'
    if (lang === 'japanese') return '🇯🇵 日语'
    return '🇰🇷 韩语'
  }

  return (
    <motion.div
      className="min-h-screen pt-20 pb-12 bg-[var(--bg-primary)] relative"
      variants={pageEnter}
      initial="initial"
      animate="animate"
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div className="mb-10">
          <h1 className="font-serif text-5xl gradient-text">社区中心</h1>
          <p className="text-[var(--text-secondary)] mt-2">与志同道合者交流，AI 助手随时为你解答</p>
          <div className="ornament mt-4" />
        </motion.div>

        {!privacyAgreed && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="liquid-glass rounded-2xl p-4 mb-6 flex items-center gap-3 border border-[var(--warning)]/20"
          >
            <Shield size={20} className="text-[var(--warning)] flex-shrink-0" />
            <p className="text-sm text-[var(--text-secondary)]">
              请先同意
              <button onClick={() => window.location.reload()} className="text-[var(--accent-primary)] underline mx-1">隐私协议书</button>
              后再发布内容和回复
            </p>
          </motion.div>
        )}

        <motion.div
          className="glass-mono-glow rounded-[2rem] p-8 mb-8"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] as const }}
        >
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-5 flex items-center space-x-2 font-serif">
            <Plus className="text-[var(--accent-primary)]" size={20} />
            <span>分享你的学习心得</span>
          </h3>
          <form onSubmit={handleSubmit}>
            <motion.div
              className="flex flex-wrap gap-2 mb-4"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {languages.map((lang) => (
                <Tooltip key={lang.code} content={`筛选${lang.name}帖子`}>
                  <motion.button
                    type="button"
                    {...buttonTap}
                    variants={staggerItem}
                    onClick={() => setSelectedLanguage(lang.code)}
                    className={`flex items-center space-x-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                      selectedLanguage === lang.code
                        ? 'btn-amber'
                        : 'liquid-glass text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span>{lang.flag}</span>
                    <span>{lang.name}</span>
                  </motion.button>
                </Tooltip>
              ))}
            </motion.div>
            <textarea
              value={newPost}
              onChange={(e) => setNewPost(e.target.value)}
              placeholder="分享你的学习心得、技巧或问题..."
              className="w-full bg-[var(--bg-elevated)] border border-[var(--accent-primary)]/[0.04] focus:border-[var(--accent-primary)]/15 text-[var(--text-primary)] placeholder-[var(--text-secondary)] rounded-xl p-4 focus:outline-none resize-none transition-all duration-300"
              rows={4}
            />
            <div className="flex justify-end mt-4">
              <motion.button
                type="submit"
                {...buttonTap}
                disabled={!newPost.trim() || !privacyAgreed}
                className="btn-amber px-6 py-2.5 rounded-xl font-semibold flex items-center space-x-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send size={18} />
                <span>发布</span>
              </motion.button>
            </div>
          </form>
        </motion.div>

        <motion.div
          className="space-y-6"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
            {posts.map((post) => (
            <motion.div
              key={post.id}
              className="liquid-glass card-liquid rounded-[2rem] p-8"
              variants={staggerItem}
            >
              <div className="flex items-start space-x-4">
                <div className="relative flex-shrink-0">
                  <UserAvatar username={post.username} size={48} src={post.avatar} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1.5">
                    <span className="font-serif text-[var(--text-primary)]">{post.username}</span>
                    <span className="glass-badge px-3 py-1 rounded-full text-xs text-[var(--accent-primary)] font-mono">
                      {languageLabel(post.language)}
                    </span>
                  </div>
                  <p className="text-[var(--text-secondary)] leading-relaxed mb-4">{post.content}</p>
                  <div className="flex items-center space-x-6">
                    <Tooltip content="点赞">
                      <motion.button
                        {...buttonTap}
                        onClick={() => handleLike(post.id)}
                        className="flex items-center space-x-1.5 text-[var(--text-muted)] hover:text-[var(--warning)] transition-all duration-300 group"
                      >
                        <Heart size={18} className="group-hover:scale-110 transition-transform" />
                        <span className="text-sm">{post.likes}</span>
                      </motion.button>
                    </Tooltip>
                    <Tooltip content="评论">
                      <button className="flex items-center space-x-1.5 text-[var(--text-muted)] hover:text-[var(--accent-primary)] transition-all duration-300 group">
                        <MessageCircle size={18} className="group-hover:scale-110 transition-transform" />
                        <span className="text-sm">{post.comments.length}</span>
                      </button>
                    </Tooltip>
                    <Tooltip content="AI回复">
                      <motion.button
                        {...buttonTap}
                        onClick={() => handleAiReply(post.id, post.content)}
                        disabled={aiReplyPost === post.id}
                        className="flex items-center space-x-1.5 text-[var(--text-muted)] hover:text-[var(--success)] transition-all duration-300 group"
                      >
                        {aiReplyPost === post.id ? (
                          <InlineLoading size="sm" color="white" />
                        ) : (
                          <Bot size={18} className="group-hover:scale-110 transition-transform" />
                        )}
                        <span className="text-sm">AI回复</span>
                      </motion.button>
                    </Tooltip>
                  </div>

                  <div className="border-t border-[var(--accent-primary)]/[0.03] pt-4 mt-4 space-y-3">
                    {post.comments.map((comment) => (
                      <div key={comment.id} className="flex items-start space-x-3">
                        {comment.username === 'AI助手' ? (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center flex-shrink-0">
                            <Bot size={16} className="text-white" />
                          </div>
                        ) : (
                          <UserAvatar username={comment.username} size={32} />
                        )}
                        <div className="flex-1">
                          <span className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-1.5">
                            {comment.username}
                            {comment.username === 'AI助手' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] font-mono">AI</span>
                            )}
                          </span>
                          <p className="text-sm text-[var(--text-secondary)]">{comment.content}</p>
                        </div>
                      </div>
                    ))}

                    <div className="flex gap-2 pt-2">
                      <input
                        type="text"
                        value={replyInputs[post.id] || ''}
                        onChange={e => setReplyInputs(prev => ({ ...prev, [post.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') handleReply(post.id) }}
                        placeholder={privacyAgreed ? "写下你的回复..." : "请先同意隐私协议"}
                        disabled={!privacyAgreed}
                        className="flex-1 bg-white/60 backdrop-blur-sm border border-[var(--accent-primary)]/10 rounded-xl px-4 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none focus:border-[var(--accent-primary)]/30 transition-all disabled:opacity-40"
                      />
                      <motion.button
                        {...buttonTap}
                        onClick={() => handleReply(post.id)}
                        disabled={!replyInputs[post.id]?.trim() || !privacyAgreed}
                        className="p-2 rounded-xl bg-[var(--accent-primary)] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--accent-hover)] transition-all"
                      >
                        <Send size={16} />
                      </motion.button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <motion.button
        onClick={() => setAiOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] text-white shadow-lg flex items-center justify-center z-50 hover:shadow-xl hover:scale-105 transition-all"
        {...buttonTap}
      >
        <Bot size={24} />
      </motion.button>

      <AnimatePresence>
        {aiOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] as const }}
            className="fixed bottom-24 right-6 w-[380px] h-[560px] z-50"
          >
            <div className="liquid-glass rounded-[2rem] overflow-hidden flex flex-col h-full shadow-xl">
              <div className="flex items-center justify-between p-4 border-b border-[var(--accent-primary)]/[0.06]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center">
                    <Sparkles size={16} className="text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">AI 助手</p>
                    <p className="text-[10px] text-[var(--text-muted)]">智谱AI · 免费模型</p>
                  </div>
                </div>
                <button
                  onClick={() => setAiOpen(false)}
                  className="p-2 rounded-xl hover:bg-black/[0.04] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {aiMessages.map((msg, i) => (
                  <motion.div
                    key={i}
                    variants={chatMessage}
                    initial="hidden"
                    animate="visible"
                    className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                  >
                    {msg.role === 'assistant' ? (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center flex-shrink-0 mt-1">
                        <Bot size={14} className="text-white" />
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-[var(--accent-primary)]/10 flex items-center justify-center flex-shrink-0 mt-1">
                        <User size={14} className="text-[var(--accent-primary)]" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-[var(--accent-primary)] text-white'
                          : 'bg-white/70 backdrop-blur-sm text-[var(--text-primary)]'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </motion.div>
                ))}
                {aiLoading && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex gap-2"
                  >
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center flex-shrink-0 mt-1">
                      <Bot size={14} className="text-white" />
                    </div>
                    <div className="bg-white/70 backdrop-blur-sm rounded-2xl px-4 py-3">
                      <div className="flex gap-1">
                        <motion.div className="w-2 h-2 rounded-full bg-[var(--accent-primary)]" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0 }} />
                        <motion.div className="w-2 h-2 rounded-full bg-[var(--accent-primary)]" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.15 }} />
                        <motion.div className="w-2 h-2 rounded-full bg-[var(--accent-primary)]" animate={{ y: [0, -4, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.3 }} />
                      </div>
                    </div>
                  </motion.div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="p-4 border-t border-[var(--accent-primary)]/[0.06]">
                <form
                  onSubmit={(e) => { e.preventDefault(); if (aiInput.trim()) handleAiChat(aiInput.trim()) }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    placeholder="输入你的语言学习问题..."
                    className="flex-1 bg-white/70 backdrop-blur-sm border border-[var(--accent-primary)]/10 rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] outline-none focus:border-[var(--accent-primary)]/30 transition-all"
                    disabled={aiLoading}
                  />
                  <motion.button
                    type="submit"
                    {...buttonTap}
                    disabled={!aiInput.trim() || aiLoading}
                    className="p-2.5 rounded-xl bg-[var(--accent-primary)] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--accent-hover)] transition-all"
                  >
                    <Send size={16} />
                  </motion.button>
                </form>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default Community
