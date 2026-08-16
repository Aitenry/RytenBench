import React, { useCallback, useEffect, useRef, useState } from 'react'
import { theme, Input, Spin, Empty, Tag } from 'antd'
import type { InputRef } from 'antd'
import {
  RiCheckLine,
  RiLoader2Line,
  RiErrorWarningLine,
  RiEditLine,
  RiSettings3Line
} from '@remixicon/react'
import type { Editor } from '@tiptap/react'
import { Window } from '../../../../resource/types/window'
import TipTapMarkdownEditor from '@renderer/components/markdown/TipTapMarkdownEditor'
import DocPropertiesModal from './DocPropertiesModal'
import { getTagsArray } from '@renderer/utils/document'
import { useMessage } from '@renderer/hooks/useMessage'
import dayjs from 'dayjs'

interface DocEditorPaneProps {
  docId: number
  /** 保存成功后回调（用于更新列表标题等） */
  onSaved: (docId: number, title: string) => void
  /** 元信息变化回调（驱动右侧属性面板） */
  onMetaChange: (meta: DocMeta | null) => void
  /** 编辑器实例就绪（驱动右侧大纲） */
  onEditorReady: (editor: Editor | null) => void
  /** 正文滚动容器（驱动大纲滚动同步，由父级持有引用） */
  scrollRef: React.RefObject<HTMLDivElement | null>
  /** 挂载后聚焦标题输入框（新建文档场景） */
  autofocusTitle?: boolean
}

export interface DocMeta {
  tags: string[]
  wordCount: number
  createdAt?: string
  updatedAt?: string
}

type SaveState = 'saved' | 'saving' | 'dirty' | 'error'

const AUTO_SAVE_DELAY = 1500

const DocEditorPane: React.FC<DocEditorPaneProps> = ({
  docId,
  onSaved,
  onMetaChange,
  onEditorReady,
  scrollRef,
  autofocusTitle = false
}) => {
  const { token } = theme.useToken()
  const { viewMessage } = useMessage()
  const api = (window as unknown as Window).api

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [summary, setSummary] = useState<string | null>(null)
  const [image, setImage] = useState<string | null>(null)
  const [createdAt, setCreatedAt] = useState<string | undefined>(undefined)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [propsOpen, setPropsOpen] = useState(false)

  const titleInputRef = useRef<InputRef | null>(null)
  const titleFocusedRef = useRef(false)

  /* 新建文档：加载完成后聚焦标题（全部选中便于直接改名） */
  useEffect(() => {
    if (autofocusTitle && !loading && !notFound && !titleFocusedRef.current) {
      titleFocusedRef.current = true
      const el = titleInputRef.current
      if (el) {
        el.focus()
        el.select()
      }
    }
  }, [autofocusTitle, loading, notFound])

  /* 回调 ref */
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved
  const onMetaChangeRef = useRef(onMetaChange)
  onMetaChangeRef.current = onMetaChange

  /* 保存相关内容 ref（避免闭包过期） */
  const docIdRef = useRef(docId)
  docIdRef.current = docId
  const titleRef = useRef(title)
  titleRef.current = title
  const contentRef = useRef(content)
  contentRef.current = content
  const lastSavedRef = useRef<{ title: string; content: string } | null>(null)
  const metaRef = useRef<DocMeta | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef(false)

  /* ── 加载文档 ── */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setNotFound(false)
    setSaveState('saved')
    setLastSavedAt(null)
    lastSavedRef.current = null
    ;(async () => {
      try {
        const doc = await api.docs.getById(docId)
        if (cancelled) return
        if (!doc) {
          setNotFound(true)
          return
        }
        setTitle(doc.title ?? '')
        setContent(doc.content ?? '')
        setTags(getTagsArray(doc.tags))
        setSummary(doc.summary)
        setImage(doc.image)
        setCreatedAt(doc.created_at)
        lastSavedRef.current = { title: doc.title ?? '', content: doc.content ?? '' }
        metaRef.current = {
          tags: getTagsArray(doc.tags),
          wordCount: doc.word_count ?? 0,
          createdAt: doc.created_at,
          updatedAt: doc.updated_at
        }
        onMetaChangeRef.current(metaRef.current)
      } catch (error) {
        console.error('Failed to load doc:', error)
        if (!cancelled) setNotFound(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      /* 卸载（切换文档）时若还有未保存修改，立即冲刷一次 */
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      const last = lastSavedRef.current
      const curTitle = titleRef.current
      const curContent = contentRef.current
      if (last && (curTitle !== last.title || curContent !== last.content)) {
        void api.docs.update(docId, { title: curTitle || '未命名文档', content: curContent })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId])

  /* ── 保存 ── */
  const doSave = useCallback(async (): Promise<void> => {
    const id = docIdRef.current
    const t = titleRef.current
    const c = contentRef.current
    const last = lastSavedRef.current
    if (last && t === last.title && c === last.content) {
      setSaveState('saved')
      return
    }
    if (savingRef.current) return
    savingRef.current = true
    setSaveState('saving')
    try {
      await api.docs.update(id, { title: t || '未命名文档', content: c })
      lastSavedRef.current = { title: t, content: c }
      setSaveState('saved')
      setLastSavedAt(new Date())
      onSavedRef.current(id, t || '未命名文档')
      metaRef.current = metaRef.current
        ? {
            ...metaRef.current,
            wordCount: (c.match(/[^\s]/g) ?? []).length,
            updatedAt: new Date().toISOString()
          }
        : null
      if (metaRef.current) onMetaChangeRef.current(metaRef.current)
    } catch (error) {
      console.error('Failed to save doc:', error)
      setSaveState('error')
    } finally {
      savingRef.current = false
    }
  }, [api])

  /* 内容/标题变化 → 标记未保存并启动自动保存 */
  const markChanged = useCallback(() => {
    const last = lastSavedRef.current
    if (last && titleRef.current === last.title && contentRef.current === last.content) {
      setSaveState('saved')
      return
    }
    setSaveState('dirty')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      doSave().then()
    }, AUTO_SAVE_DELAY)
  }, [doSave])

  const handleContentChange = useCallback(
    (md: string) => {
      contentRef.current = md
      setContent(md)
      markChanged()
    },
    [markChanged]
  )

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      titleRef.current = value
      setTitle(value)
      markChanged()
    },
    [markChanged]
  )

  const handleSaveNow = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    doSave().then()
  }, [doSave])

  const handleEditorReady = useCallback(
    (editor: Editor) => {
      onEditorReady(editor)
    },
    [onEditorReady]
  )

  /* ── 保存文档属性（标签/摘要/封面） ── */
  const handlePropsSave = useCallback(
    async (data: {
      image: string | null
      summary: string | null
      tags: string[]
    }): Promise<void> => {
      const messageKey = 'doc-props-save'
      try {
        await api.docs.update(docIdRef.current, {
          image: data.image,
          summary: data.summary,
          tags: data.tags.length > 0 ? JSON.stringify(data.tags) : null
        })
        setTags(data.tags)
        setSummary(data.summary)
        setImage(data.image)
        metaRef.current = metaRef.current
          ? { ...metaRef.current, tags: data.tags }
          : metaRef.current
        if (metaRef.current) onMetaChangeRef.current(metaRef.current)
        onSavedRef.current(docIdRef.current, titleRef.current || '未命名文档')
        viewMessage(messageKey, 'success', '文档属性已保存', 2)
      } catch (error) {
        console.error('Failed to save doc properties:', error)
        viewMessage(messageKey, 'error', '保存文档属性失败')
      }
    },
    [api, viewMessage]
  )

  /* 卸载时清理 onEditorReady */
  useEffect(() => {
    return () => onEditorReady(null)
  }, [onEditorReady])

  if (loading) {
    return (
      <PaneShell token={token}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%'
          }}
        >
          <Spin size="large" />
        </div>
      </PaneShell>
    )
  }

  if (notFound) {
    return (
      <PaneShell token={token}>
        <Empty description="文档不存在或已被删除" style={{ marginTop: 120 }} />
      </PaneShell>
    )
  }

  const saveIndicator = ((): React.ReactNode => {
    switch (saveState) {
      case 'saving':
        return (
          <>
            <RiLoader2Line size={13} className="spin-anim" style={{ color: token.colorPrimary }} />
            <span style={{ color: token.colorTextSecondary }}>保存中…</span>
          </>
        )
      case 'dirty':
        return (
          <>
            <RiEditLine size={13} style={{ color: token.colorTextTertiary }} />
            <span style={{ color: token.colorTextTertiary }}>未保存</span>
          </>
        )
      case 'error':
        return (
          <>
            <RiErrorWarningLine size={13} style={{ color: token.colorError }} />
            <span style={{ color: token.colorError }}>保存失败</span>
          </>
        )
      default:
        return (
          <>
            <RiCheckLine size={13} style={{ color: token.colorSuccess }} />
            <span style={{ color: token.colorTextTertiary }}>
              已保存{lastSavedAt ? ` ${dayjs(lastSavedAt).format('HH:mm:ss')}` : ''}
            </span>
          </>
        )
    }
  })()

  return (
    <PaneShell token={token}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          height: '100%',
          maxWidth: 876,
          width: '100%',
          margin: '0 auto'
        }}
      >
        {/* 标题 + 元信息（不随正文滚动） */}
        <div style={{ padding: '18px 48px 0', flexShrink: 0 }}>
          <Input
            ref={titleInputRef}
            variant="borderless"
            value={title}
            onChange={handleTitleChange}
            placeholder="未命名文档"
            maxLength={120}
            style={{
              fontSize: 24,
              fontWeight: 700,
              padding: 0,
              letterSpacing: -0.01
            }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginTop: 8,
              fontSize: 12,
              color: token.colorTextTertiary,
              flexWrap: 'wrap'
            }}
          >
            {createdAt && <span>创建于 {dayjs(createdAt).format('YYYY-MM-DD')}</span>}
            {tags.length > 0 && (
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {tags.map((tag) => (
                  <Tag
                    key={tag}
                    variant="filled"
                    style={{
                      margin: 0,
                      fontSize: 11,
                      lineHeight: '18px',
                      padding: '0 8px',
                      borderRadius: 9,
                      background: token.colorPrimaryBg,
                      color: token.colorPrimary
                    }}
                  >
                    {tag}
                  </Tag>
                ))}
              </span>
            )}
            <span
              onClick={() => setPropsOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
                padding: '1px 8px',
                borderRadius: 6,
                color: token.colorTextTertiary,
                background: 'transparent',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = token.colorFillTertiary
                e.currentTarget.style.color = token.colorTextSecondary
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = token.colorTextTertiary
              }}
            >
              <RiSettings3Line size={12} />
              属性
            </span>
          </div>
        </div>

        {/* 编辑器（自带滚动；文档加载完成后才挂载，避免空内容闪烁） */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            ['--ed-body-pad-top' as string]: '20px'
          }}
        >
          {!loading && !notFound && (
            <TipTapMarkdownEditor
              key={docId}
              value={content}
              onChange={handleContentChange}
              onSave={() => handleSaveNow()}
              onReady={handleEditorReady}
              scrollRef={scrollRef}
            />
          )}
        </div>

        {/* 底部状态条 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 32,
            padding: '0 16px',
            flexShrink: 0,
            borderTop: `1px solid ${token.colorBorderSecondary}`,
            fontSize: 12
          }}
        >
          {saveIndicator}
          <span style={{ flex: 1 }} />
          <span style={{ color: token.colorTextQuaternary, fontSize: 11 }}>
            Ctrl+S 立即保存 · 编辑后自动保存
          </span>
        </div>
      </div>

      {/* 文档属性小弹窗（标签/摘要/封面） */}
      <DocPropertiesModal
        open={propsOpen}
        doc={{ title, summary, tags: JSON.stringify(tags), image }}
        onClose={() => setPropsOpen(false)}
        onSave={handlePropsSave}
      />
    </PaneShell>
  )
}

/* ──────────── 外壳 ──────────── */

const PaneShell: React.FC<{
  token: ReturnType<typeof theme.useToken>['token']
  children: React.ReactNode
}> = ({ token, children }) => (
  <div
    style={{
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      display: 'flex',
      background: token.colorBgContainer,
      border: `1px solid ${token.colorBorderSecondary}`,
      borderRadius: 12,
      overflow: 'hidden'
    }}
  >
    {children}
  </div>
)

export default DocEditorPane
