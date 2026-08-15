import { describe, it, expect } from 'vitest'
import { skeletonKeyFor } from './registry'

describe('skeletonKeyFor', () => {
  it('首页/课程映射 dashboard', () => {
    expect(skeletonKeyFor('/')).toBe('dashboard')
    expect(skeletonKeyFor('/courses')).toBe('dashboard')
  })
  it('管理端映射 form', () => {
    expect(skeletonKeyFor('/admin/security')).toBe('form')
  })
  it('学习页映射 detail', () => {
    expect(skeletonKeyFor('/learn/word')).toBe('detail')
  })
  it('其余映射 default', () => {
    expect(skeletonKeyFor('/profile')).toBe('default')
  })
})