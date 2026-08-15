import { motion } from "framer-motion";
import { FileText, Users, BookOpen, AlertTriangle, Scale, MessageCircle } from "lucide-react";

const sections = [
  {
    icon: FileText,
    title: "服务说明",
    content:
      "LinguaLeap提供多语种在线学习服务",
  },
  {
    icon: Users,
    title: "用户账户",
    content:
      "注册义务、账户安全、禁止共享账户",
  },
  {
    icon: BookOpen,
    title: "使用规范",
    content:
      "禁止行为：骚扰、侵权、传播有害内容",
  },
  {
    icon: AlertTriangle,
    title: "免责声明",
    content:
      '服务现状"提供，不保证 uninterrupted',
  },
  {
    icon: Scale,
    title: "知识产权",
    content:
      "平台内容版权归LinguaLeap 所有",
  },
  {
    icon: MessageCircle,
    title: "争议解决",
    content:
      "争议通过友好协商解决，协商不成提交仲裁",
  },
];

export default function TermsOfService() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen bg-[var(--bg-primary)] py-20 px-4"
    >
      <div className="max-w-3xl mx-auto">
        <h1 className="font-serif text-5xl gradient-text mb-12">服务条款</h1>

        {sections.map((section, index) => {
          const Icon = section.icon;
          return (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
              className="liquid-glass rounded-[2rem] p-8 mb-6"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-black/10 text-[var(--accent-primary)] flex items-center justify-center shrink-0">
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="font-serif text-xl text-[var(--text-primary)] mb-2">
                    {section.title}
                  </h2>
                  <p className="text-[var(--text-secondary)] leading-relaxed">
                    {section.content}
                  </p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
