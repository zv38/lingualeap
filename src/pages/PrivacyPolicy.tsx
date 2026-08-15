import { motion } from "framer-motion";
import { Shield, Lock, Eye, Database, Mail, FileText, RefreshCw, UserCheck, Cookie } from "lucide-react";

const sections = [
  {
    icon: FileText,
    title: "总则",
    content:
      `LinguaLeap（以下简称「本平台」）深知个人隐私的重要性，致力于保护您的个人信息安全。本隐私政策详细说明了我们如何收集、使用、存储和保护您的个人信息。使用本平台服务即表示您已阅读并同意本政策的条款。如您不同意，请停止使用本平台服务。`,
  },
  {
    icon: Shield,
    title: "信息收集的范围与方式",
    content:
      "我们在以下场景中收集您的信息：\n• 注册时：用户名、电子邮箱地址、密码（经过bcrypt哈希加密存储，本平台无法获取原始密码）\n• 学习过程中：学习进度、课程完成情况、测试成绩、学习时长、练习记录\n• 使用社区功能时：发布的帖子、评论、点赞记录\n• 设备信息：浏览器类型及版本、操作系统、屏幕分辨率（用于优化显示）\n• 网络信息：IP地址（用于安全审计和地理位置统计）\n• Cookie：用于维持登录状态和记录偏好设置",
  },
  {
    icon: UserCheck,
    title: "信息使用目的",
    content:
      "收集的信息仅用于以下目的：\n• 提供和优化个性化学习服务\n• 分析学习行为以改进课程内容和推荐算法\n• 发送服务通知（如学习提醒、系统公告）\n• 保障账户安全（如检测异常登录）\n• 改善用户体验和界面设计\n• 生成学习统计报告供您参考\n我们不会将您的个人信息用于与上述目的无关的用途。",
  },
  {
    icon: Lock,
    title: "信息安全保护措施",
    content:
      "本平台采用多层次安全防护体系：\n• 传输层：全站 HTTPS 加密传输，防止数据在传输过程中被截获\n• 存储层：密码使用 bcrypt 算法（10轮salt）哈希存储；本地存储数据使用 AES-256-GCM 加密（PBKDF2 密钥派生，600000次迭代）\n• 认证层：支持双因素认证（TOTP）、JWT 令牌认证\n• 防护层：速率限制防暴力破解、CSRF 令牌防护、安全响应头\n• 会话管理：登录会话可查看和远程撤销，支持登录历史审计\n• 验证码：注册和登录需要图形验证码",
  },
  {
    icon: Eye,
    title: "用户权利",
    content:
      "根据《个人信息保护法》，您享有以下权利：\n• 知情权：了解您的哪些信息被收集以及如何使用\n• 访问权：随时查看您的个人资料和学习数据\n• 更正权：修改不准确的个人信息\n• 删除权：在隐私设置中删除您的全部数据（清除所有本地存储和服务器数据）\n• 撤回同意权：撤销对隐私协议的同意\n• 数据可携带权：在隐私设置中导出您的全部数据为 JSON 格式\n• 注销权：联系客服注销账户\n如要行使上述权利，请前往「隐私与安全设置」页面操作。",
  },
  {
    icon: Database,
    title: "数据存储与保留期限",
    content:
      "• 数据存储位置：您的数据存储在本平台位于中国境内的安全服务器上\n• 保留期限：在您使用服务期间持续保留；账户注销后 30 天内删除所有数据\n• 本地存储：学习进度和偏好设置存储在您的浏览器本地（AES-256-GCM 加密）\n• 如因业务需要涉及跨境数据传输，我们将严格遵守《个人信息保护法》和《数据安全法》的相关规定，进行安全评估并取得您的单独同意",
  },
  {
    icon: Cookie,
    title: "Cookie 政策",
    content:
      "本平台使用以下类型的 Cookie：\n• 必要 Cookie：用于维持登录状态和会话管理，拒绝后将无法正常使用服务\n• 偏好 Cookie：记录您的主题设置、语言偏好等\n• 分析 Cookie：用于统计页面访问量和使用模式（仅聚合数据，不涉及个人身份）\n您可以在「隐私与安全设置」中管理 Cookie 偏好。",
  },
  {
    icon: RefreshCw,
    title: "政策更新",
    content:
      "• 本平台有权根据法律法规变化和业务发展需要更新本隐私政策\n• 更新后的政策将在本页面公示，并注明最后更新日期\n• 重大变更将通过站内通知或您注册时提供的电子邮件地址告知\n• 如您继续使用服务，视为接受更新后的政策\n• 建议您定期查看本页面以了解最新的隐私保护措施",
  },
  {
    icon: Mail,
    title: "联系我们",
    content:
      "如您对本隐私政策有任何疑问、意见或投诉，请通过以下方式联系我们：\n• 电子邮箱：privacy@lingualeap.com\n• 数据保护负责人：privacy@lingualeap.com\n• 服务时间：工作日 9:00-18:00\n• 我们将在收到请求后 48 小时内回复\n如您对我们的处理方式不满意，有权向相关监管机构投诉。",
  },
];

export default function PrivacyPolicy() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen bg-[var(--bg-primary)] py-20 px-4"
    >
      <div className="max-w-3xl mx-auto">
        <h1 className="font-serif text-5xl gradient-text mb-2">隐私政策</h1>
        <p className="font-mono text-xs text-[var(--text-muted)] mb-12">
          最后更新：2026年5月16日        </p>

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
                <div className="w-12 h-12 rounded-2xl bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] flex items-center justify-center shrink-0">
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="font-serif text-xl text-[var(--text-primary)] mb-2">
                    {section.title}
                  </h2>
                  {section.content.split('\n').map((line, li) => (
                    <p key={li} className="text-[var(--text-secondary)] leading-relaxed mb-1 last:mb-0">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
