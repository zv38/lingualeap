import { motion } from 'framer-motion'
import { useState } from 'react'
import { Send, Search, Check, CheckCheck } from 'lucide-react'
import { useStore } from '../store/useStore'
import Tooltip from '../components/Tooltip'
import { mockDirectMessages } from '../data/mockData'
import UserAvatar from '../components/UserAvatar'

const Messages = () => {
  const { user } = useStore()
  const [selectedContact, setSelectedContact] = useState<string>('u2')
  const [searchQuery, setSearchQuery] = useState('')
  const [messageInput, setMessageInput] = useState('')
  const [messages, setMessages] = useState(mockDirectMessages)

  const contacts = [
    { id: 'u2', name: '日语爱好者', lastMessage: '你好！一起学习日语吗', unread: 1 },
    { id: 'u3', name: 'K-pop', lastMessage: '最近学了什么新歌？', unread: 0 },
    { id: 'u6', name: '英语学霸', lastMessage: '分享一个背单词技巧', unread: 0 },
  ]

  const filteredContacts = contacts.filter((contact) =>
    contact.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const currentMessages = messages.filter(
    (msg) =>
      (msg.senderId === selectedContact && msg.receiverId === user?.id) ||
      (msg.senderId === user?.id && msg.receiverId === selectedContact)
  )

  const selectedContactData = contacts.find((c) => c.id === selectedContact)

  const handleSend = () => {
    if (!messageInput.trim()) return
    const newMessage = {
      id: `dm${Date.now()}`,
      senderId: user?.id || 'u0',
      receiverId: selectedContact,
      content: messageInput,
      createdAt: new Date().toISOString(),
      read: false,
    }
    setMessages((prev) => [...prev, newMessage])
    setMessageInput('')
    ;(window as any).toast('消息已发送', 'success')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] as const }}
      className="min-h-screen pt-20 pb-12 bg-[var(--bg-primary)]"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-[calc(100vh-8rem)]">
        <div className="flex gap-4 h-full">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] as const }}
            className="liquid-glass rounded-[2rem] p-4 w-80 flex flex-col flex-shrink-0"
          >
            <div className="flex items-center gap-3 liquid-glass rounded-full px-4 py-3 mb-4">
              <Search size={16} className="text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="搜索联系人..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none text-sm"
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {filteredContacts.map((contact, index) => (
                <motion.button
                  key={contact.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 + index * 0.1, ease: [0.22, 1, 0.36, 1] as const }}
                  onClick={() => setSelectedContact(contact.id)}
                  className={`w-full flex items-center gap-3 rounded-xl p-3 transition-all ${
                    selectedContact === contact.id
                      ? 'liquid-glass-mono'
                      : 'liquid-glass hover:bg-[var(--accent-primary)]/5'
                  }`}
                >
                  <UserAvatar username={contact.name} size={40} />
                  <div className="flex-1 min-w-0 text-left">
                    <p className="font-serif text-sm text-[var(--text-primary)] truncate">{contact.name}</p>
                    <p className="text-xs text-[var(--text-secondary)] truncate">{contact.lastMessage}</p>
                  </div>
                  {contact.unread > 0 && (
                    <span className="bg-[var(--accent-primary)] text-white rounded-full px-2 py-0.5 text-xs font-mono flex-shrink-0">
                      {contact.unread}
                    </span>
                  )}
                </motion.button>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] as const }}
            className="liquid-glass rounded-[2rem] p-6 flex-1 flex flex-col"
          >
            {selectedContactData && (
              <div className="flex items-center gap-3 pb-4 mb-4 border-b border-black/[0.03]">
                <UserAvatar username={selectedContactData.name} size={40} />
                <div>
                  <p className="font-serif text-[var(--text-primary)]">{selectedContactData.name}</p>
                  <p className="text-xs text-[var(--text-muted)] font-mono">在线</p>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-3 mb-4">
              {currentMessages.map((msg, index) => {
                const isSent = msg.senderId === user?.id
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    className={`flex ${isSent ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] px-4 py-2 ${
                        isSent
                          ? 'liquid-glass-mono rounded-2xl rounded-tr-sm'
                          : 'liquid-glass rounded-2xl rounded-tl-sm'
                      }`}
                    >
                      <p className="text-sm text-[var(--text-primary)]">{msg.content}</p>
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <span className="text-[10px] text-[var(--text-muted)] font-mono">
                          {new Date(msg.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {isSent && (
                          msg.read ? (
                            <CheckCheck size={12} className="text-[var(--accent-primary)]" />
                          ) : (
                            <Check size={12} className="text-[var(--text-muted)]" />
                          )
                        )}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>

            <div className="liquid-glass rounded-full px-4 py-2 flex items-center gap-3">
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="输入消息..."
                className="flex-1 bg-transparent text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none text-sm"
              />
              <Tooltip content="发送消息">
                <motion.button
                  onClick={handleSend}
                  className="btn-amber rounded-full p-2 flex-shrink-0"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Send size={16} />
                </motion.button>
              </Tooltip>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}

export default Messages
