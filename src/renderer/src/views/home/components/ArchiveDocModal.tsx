import React, { useCallback, useEffect, useState } from 'react'
import { Modal, Spin, Empty, theme } from 'antd'
import { RiBook2Line, RiFolder2Line } from '@remixicon/react'
import { Window } from '../../../../resource/types/window'
import { useMessage } from '@renderer/hooks/useMessage'
import type { DocListItem, WikiRow, WikiDirectoryRow } from '@renderer/types/models'

interface ArchiveDocModalProps {
  open: boolean
  doc: DocListItem | null
  wikis: WikiRow[]
  onArchived: () => void
  onClose: () => void
}

/**
 * 归档文档到知识库目录（从旧画布流程移植，改为独立弹窗）
 */
const ArchiveDocModal: React.FC<ArchiveDocModalProps> = ({
  open,
  doc,
  wikis,
  onArchived,
  onClose
}) => {
  const { token } = theme.useToken()
  const api = (window as unknown as Window).api
  const { viewMessage } = useMessage()

  const itemStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 10px',
    borderRadius: 7,
    cursor: 'pointer',
    marginBottom: 4,
    fontSize: 13,
    background: active ? token.colorPrimaryBg : 'transparent',
    color: active ? token.colorPrimary : token.colorText
  })

  const [selectedWikiId, setSelectedWikiId] = useState<number | null>(null)
  const [directories, setDirectories] = useState<WikiDirectoryRow[]>([])
  const [selectedDirId, setSelectedDirId] = useState<number | null>(null)
  const [dirsLoading, setDirsLoading] = useState(false)

  /* 重置 */
  useEffect(() => {
    if (open) {
      setSelectedWikiId(null)
      setDirectories([])
      setSelectedDirId(null)
    }
  }, [open])

  const handleSelectWiki = useCallback(
    async (wikiId: number): Promise<void> => {
      setSelectedWikiId(wikiId)
      setSelectedDirId(null)
      setDirsLoading(true)
      try {
        const dirs = await api.wikis.getDirectories(wikiId)
        setDirectories(dirs)
      } catch (error) {
        console.error('Failed to load directories:', error)
      } finally {
        setDirsLoading(false)
      }
    },
    [api]
  )

  const handleArchive = useCallback(async (): Promise<void> => {
    if (!doc || selectedDirId == null) return
    const messageKey = 'archive-doc'
    try {
      viewMessage(messageKey, 'loading', '正在归档文档...')
      await api.wikis.addNoteToDirectory(selectedDirId, doc.id)
      viewMessage(messageKey, 'success', '文档归档成功！', 2)
      onArchived()
      onClose()
    } catch (error) {
      console.error('Failed to archive doc:', error)
      viewMessage(messageKey, 'error', '归档文档失败')
    }
  }, [doc, selectedDirId, api, viewMessage, onArchived, onClose])

  return (
    <Modal
      title={`归档「${doc?.title ?? ''}」到知识库目录`}
      open={open}
      onCancel={onClose}
      onOk={handleArchive}
      okText="归档"
      cancelText="取消"
      okButtonProps={{ disabled: selectedDirId == null }}
      width={520}
    >
      <div style={{ display: 'flex', gap: 12, height: 300 }}>
        {/* 知识库列表 */}
        <div
          className="custom-scrollbar"
          style={{
            flex: 1,
            overflowY: 'auto',
            borderRight: '1px solid rgba(128,128,128,0.18)',
            paddingRight: 8
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>1. 选择知识库</div>
          {wikis.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无知识库" />
          ) : (
            wikis.map((wiki) => {
              const active = selectedWikiId === wiki.id
              return (
                <div
                  key={wiki.id}
                  onClick={() => handleSelectWiki(wiki.id)}
                  style={itemStyle(active)}
                >
                  <RiBook2Line size={13} />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {wiki.title}
                  </span>
                </div>
              )
            })
          )}
        </div>
        {/* 目录列表 */}
        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>2. 选择目录</div>
          {selectedWikiId == null ? (
            <div style={{ color: token.colorTextTertiary, fontSize: 12.5 }}>请先选择知识库</div>
          ) : dirsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
              <Spin size="small" />
            </div>
          ) : directories.length === 0 ? (
            <div style={{ color: token.colorTextTertiary, fontSize: 12.5 }}>该知识库暂无目录</div>
          ) : (
            directories.map((dir) => {
              const active = selectedDirId === dir.id
              return (
                <div
                  key={dir.id}
                  onClick={() => setSelectedDirId(dir.id)}
                  style={itemStyle(active)}
                >
                  <RiFolder2Line size={13} />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {dir.name}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </Modal>
  )
}

export default ArchiveDocModal
