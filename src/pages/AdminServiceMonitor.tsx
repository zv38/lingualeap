import { useEffect, useState, useRef, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Activity, RefreshCw, ArrowLeft, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import * as THREE from 'three'

interface ServiceInfo {
  id: string
  name: string
  endpoint: string
  icon: string
  status: 'running' | 'stopped' | 'degraded'
  uptime: string
  port: number
  description: string
}

const serviceList: ServiceInfo[] = [
  { id: 'api', name: 'API 服务', endpoint: '/api/health', icon: 'server', status: 'running' as const, uptime: '-', port: 3001, description: 'Express REST API 服务，处理所有业务逻辑和数据请求' },
  { id: 'frontend', name: '前端服务', endpoint: '/api/ping', icon: 'globe', status: 'running' as const, uptime: '-', port: 3000, description: 'React SPA 前端应用，提供用户界面' },
  { id: 'ai', name: 'AI 服务', endpoint: '/api/ping', icon: 'cpu', status: 'running' as const, uptime: '-', port: 0, description: '智能 AI GLM-4 模型，提供智能对话和辅助学习' },
  { id: 'database', name: '数据存储', endpoint: '/api/ping', icon: 'database', status: 'running' as const, uptime: '-', port: 0, description: '内存数据库，存储用户、课程、进度等数据' },
  { id: 'auth', name: '认证服务', endpoint: '/api/csrf-token', icon: 'activity', status: 'running' as const, uptime: '-', port: 0, description: 'JWT 认证 + 2FA 双因素认证服务' },
]

const statusColors = {
  running: 'var(--success)',
  stopped: 'var(--warning)',
  degraded: 'var(--accent-primary)',
}

const statusIcons = {
  running: CheckCircle,
  stopped: XCircle,
  degraded: AlertTriangle,
}

function hexShape() {
  const shape = new THREE.Shape()
  const size = 1
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6
    const x = Math.cos(angle) * size
    const y = Math.sin(angle) * size
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  return shape
}

const HEX_SHAPE = hexShape()
const HEX_GEOMETRY = new THREE.ExtrudeGeometry(HEX_SHAPE, {
  depth: 0.25,
  bevelEnabled: true,
  bevelThickness: 0.04,
  bevelSize: 0.04,
  bevelSegments: 3,
})

function hexPosition(index: number, total: number): [number, number, number] {
  const hexW = 2.3
  const hexH = 2.0
  if (total <= 3) {
    const startX = -((total - 1) * hexW) / 2
    return [startX + index * hexW, 0, 0]
  }
  const topCount = Math.ceil(total / 2) + 1
  const botCount = Math.floor(total / 2)
  const topStartX = -((topCount - 1) * hexW) / 2
  const botStartX = -((botCount - 1) * hexW) / 2 + hexW / 2
  if (index < topCount) {
    return [topStartX + index * hexW, hexH * 0.52, 0]
  }
  const bi = index - topCount
  return [botStartX + bi * hexW, -hexH * 0.52, 0]
}

function HexCell({ service, index, total, onHover, onClick, isSelected, isHovered }: {
  service: ServiceInfo
  index: number
  total: number
  onHover: (id: string | null) => void
  onClick: (id: string) => void
  isSelected: boolean
  isHovered: boolean
}) {
  const groupRef = useRef<THREE.Group>(null)
  const glowRef = useRef<THREE.Mesh>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const pos = hexPosition(index, total)
  const color = statusColors[service.status]

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.z = isSelected ? 0.3 : isHovered ? 0.15 : 0
    }
    if (glowRef.current) {
      const pulse = service.status === 'running'
        ? 0.12 + Math.sin(state.clock.elapsedTime * 2 + index * 1.2) * 0.06
        : 0.04
      ;(glowRef.current.material as THREE.MeshBasicMaterial).opacity = pulse
    }
    if (ringRef.current && service.status === 'running') {
      const s = 1 + Math.sin(state.clock.elapsedTime * 1.5 + index) * 0.05
      ringRef.current.scale.set(s, s, 1)
      ;(ringRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.15 + Math.sin(state.clock.elapsedTime * 2 + index * 0.8) * 0.1
    }
  })

  return (
    <group ref={groupRef} position={pos}>
      <mesh
        geometry={HEX_GEOMETRY}
        rotation={[0, 0, 0]}
        onPointerOver={() => onHover(service.id)}
        onPointerOut={() => onHover(null)}
        onClick={() => onClick(service.id)}
      >
        <meshPhysicalMaterial
          color={isSelected ? color : 'var(--text-primary)'}
          emissive={color}
          emissiveIntensity={isSelected ? 0.3 : isHovered ? 0.2 : 0.08}
          roughness={0.15}
          metalness={0.7}
          clearcoat={0.6}
          clearcoatRoughness={0.2}
          transparent
          opacity={isSelected ? 0.95 : 0.88}
        />
      </mesh>

      <mesh ref={glowRef} position={[0, 0, -0.05]} rotation={[0, 0, 0]}>
        <shapeGeometry args={[HEX_SHAPE]} />
        <meshBasicMaterial color={color} transparent opacity={0.12} side={THREE.DoubleSide} />
      </mesh>

      {service.status === 'running' && (
        <mesh ref={ringRef} position={[0, 0, -0.08]} rotation={[0, 0, 0]}>
          <ringGeometry args={[1.02, 1.08, 6]} />
          <meshBasicMaterial color={color} transparent opacity={0.15} side={THREE.DoubleSide} />
        </mesh>
      )}

      <Text
        position={[0, 0.25, 0.3]}
        fontSize={0.22}
        color="var(--bg-primary)"
        anchorX="center"
        anchorY="middle"
        fontWeight={500}
      >
        {service.name}
      </Text>
      <Text
        position={[0, -0.1, 0.3]}
        fontSize={0.13}
        color={color}
        anchorX="center"
        anchorY="middle"
      >
        {service.status === 'running' ? '● 运行中' : service.status === 'stopped' ? '● 已停止' : '● 异常'}
      </Text>
      <Text
        position={[0, -0.38, 0.3]}
        fontSize={0.1}
        color="var(--text-muted)"
        anchorX="center"
        anchorY="middle"
      >
        {service.uptime} 路 :{service.port || '-'}
      </Text>
    </group>
  )
}

function HoneycombGrid({ services, onHover, onClick, hoveredId, selectedId }: {
  services: ServiceInfo[]
  onHover: (id: string | null) => void
  onClick: (id: string) => void
  hoveredId: string | null
  selectedId: string | null
}) {
  const gridRef = useRef<THREE.Group>(null)

  useFrame((state) => {
    if (gridRef.current) {
      gridRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.15) * 0.03
      gridRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.1) * 0.02
    }
  })

  return (
    <group ref={gridRef}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 8, 5]} intensity={1.2} />
      <directionalLight position={[-3, -2, 4]} intensity={0.4} />
      <pointLight position={[0, 0, 5]} intensity={0.6} color="var(--accent-primary)" />
      <pointLight position={[3, 3, 3]} intensity={0.3} color="var(--success)" />
      <pointLight position={[-3, -2, 3]} intensity={0.2} color="var(--warning)" />

      {services.map((service, i) => (
        <HexCell
          key={service.id}
          service={service}
          index={i}
          total={services.length}
          onHover={onHover}
          onClick={onClick}
          isSelected={selectedId === service.id}
          isHovered={hoveredId === service.id}
        />
      ))}

      <mesh position={[0, 0, -0.5]} rotation={[0, 0, 0]}>
        <planeGeometry args={[14, 8]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} />
      </mesh>
    </group>
  )
}

export default function AdminServiceMonitor() {
  const navigate = useNavigate()
  const [services, setServices] = useState<ServiceInfo[]>(serviceList)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const checkServices = async () => {
    setChecking(true)
    const updated = await Promise.all(
      serviceList.map(async (svc) => {
        try {
          const start = Date.now()
          const res = await fetch(svc.endpoint, { signal: AbortSignal.timeout(5000) })
          const elapsed = Date.now() - start
          return {
            ...svc,
            status: res.ok ? 'running' as const : 'degraded' as const,
            uptime: `${elapsed}ms`,
          }
        } catch {
          return { ...svc, status: 'stopped' as const, uptime: '-' }
        }
      })
    )
    setServices(updated)
    setChecking(false)
  }

  useEffect(() => {
    checkServices()
    const interval = setInterval(checkServices, 30000)
    return () => clearInterval(interval)
  }, [])

  const selected = selectedId ? services.find(s => s.id === selectedId) : null
  const StatusIcon = selected ? statusIcons[selected.status] : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen bg-[var(--bg-primary)] py-20 px-4"
    >
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <motion.button
              onClick={() => navigate('/admin')}
              className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/5 transition-all"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <ArrowLeft size={20} />
            </motion.button>
            <div>
              <h1 className="font-serif text-4xl gradient-text mb-1">服务监控</h1>
              <p className="text-sm text-[var(--text-secondary)]">实时监控系统各服务运行状态</p>
            </div>
          </div>
          <motion.button
            onClick={checkServices}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-[var(--accent-primary)] bg-[var(--accent-primary)]/8 hover:bg-[var(--accent-primary)]/15 transition-all"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
            刷新状态          </motion.button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="glass-panel rounded-[2rem] overflow-hidden" style={{ height: '520px' }}>
              <Canvas
                camera={{ position: [0, 0, 7], fov: 45 }}
                dpr={[1, 1.5]}
                gl={{ antialias: true }}
              >
                <Suspense fallback={null}>
                  <HoneycombGrid
                    services={services}
                    onHover={setHoveredId}
                    onClick={setSelectedId}
                    hoveredId={hoveredId}
                    selectedId={selectedId}
                  />
                </Suspense>
              </Canvas>
            </div>
          </div>

          <div className="space-y-4">
            <div className="glass-panel rounded-[2rem] p-6">
              <h2 className="font-serif text-lg text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <Activity size={18} className="text-[var(--accent-primary)]" />
                鏈嶅姟姒傝
              </h2>
              <div className="space-y-3">
                {services.map((svc) => {
                  const Icon = statusIcons[svc.status]
                  const isHovered = hoveredId === svc.id
                  const isSelected = selectedId === svc.id
                  return (
                    <motion.button
                      key={svc.id}
                      onClick={() => setSelectedId(isSelected ? null : svc.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                        isSelected
                          ? 'bg-[var(--accent-primary)]/10'
                          : isHovered
                            ? 'bg-[var(--accent-primary)]/5'
                            : 'hover:bg-[var(--accent-primary)]/3'
                      }`}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <div className="relative">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: statusColors[svc.status] }} />
                        {svc.status === 'running' && (
                          <motion.div
                            className="absolute inset-0 rounded-full"
                            style={{ backgroundColor: statusColors[svc.status] }}
                            animate={{ opacity: [0.3, 0, 0.3], scale: [1, 1.8, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)]">{svc.name}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">{svc.uptime}</p>
                      </div>
                      <Icon size={14} color={statusColors[svc.status]} />
                    </motion.button>
                  )
                })}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {selected && (
                <motion.div
                  key={selected.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="glass-panel rounded-[2rem] p-6"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
                      backgroundColor: `${statusColors[selected.status]}15`,
                    }}>
                      {StatusIcon && <StatusIcon size={20} color={statusColors[selected.status]} />}
                    </div>
                    <div>
                      <h3 className="font-serif text-base text-[var(--text-primary)]">{selected.name}</h3>
                      <p className="text-[10px] text-[var(--text-muted)] font-mono">{selected.id}</p>
                    </div>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">{selected.description}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-lg bg-black/[0.02]">
                      <span className="text-[var(--text-muted)]">端口</span>
                      <p className="text-[var(--text-primary)] font-mono">{selected.port || '-'}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-black/[0.02]">
                      <span className="text-[var(--text-muted)]">状态</span>
                      <p className="text-[var(--text-primary)]" style={{ color: statusColors[selected.status] }}>
                        {selected.status === 'running' ? '运行中' : selected.status === 'stopped' ? '已停止' : '异常'}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-black/[0.02]">
                      <span className="text-[var(--text-muted)]">响应时间</span>
                      <p className="text-[var(--text-primary)] font-mono">{selected.uptime}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-black/[0.02]">
                      <span className="text-[var(--text-muted)]">绔偣</span>
                      <p className="text-[var(--text-primary)] font-mono text-[10px] truncate">{selected.endpoint}</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
