import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, Spin, Empty, theme } from 'antd'
import { RiBook2Line, RiFolder2Line } from '@remixicon/react'
import { Window } from '../../../../resource/types/window'
import { useMessage } from '@renderer/hooks/useMessage'
import { useTranslation } from '@renderer/i18n'
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
  const { t } = useTranslation()

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
  /* 请求序号：只接受最新一次请求的响应（修复：快速切换知识库时慢响应覆盖新列表） */
  const dirsReqSeqRef = useRef(0)

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
      const reqSeq = dirsReqSeqRef.current + 1
      dirsReqSeqRef.current = reqSeq
      setSelectedWikiId(wikiId)
      setSelectedDirId(null)
      setDirsLoading(true)
      try {
        const dirs = await api.wikis.getDirectories(wikiId)
        // 过期响应丢弃（修复：先点 A 慢、再点 B 快时,A 的目录列表覆盖 B）
        if (dirsReqSeqRef.current !== reqSeq) return
        setDirectories(dirs)
      } catch (error) {
        console.error('Failed to load directories:', error)
      } finally {
        if (dirsReqSeqRef.current === reqSeq) setDirsLoading(false)
      }
    },
    [api]
  )

  const handleArchive = useCallback(async (): Promise<void> => {
    if (!doc || selectedDirId == null) return
    const messageKey = 'archive-doc'
    try {
      viewMessage(messageKey, 'loading', t('home.archive.archiving'))
      await api.wikis.addNoteToDirectory(selectedDirId, doc.id)
      viewMessage(messageKey, 'success', t('home.archive.success'), 2)
      onArchived()
      onClose()
    } catch (error) {
      console.error('Failed to archive doc:', error)
      viewMessage(messageKey, 'error', t('home.archive.failed'))
    }
  }, [doc, selectedDirId, api, viewMessage, onArchived, onClose, t])

  return (
    <Modal
      title={t('home.archive.title', { name: doc?.title ?? '' })}
      open={open}
      onCancel={onClose}
      onOk={handleArchive}
      okText={t('home.archive.ok')}
      cancelText={t('common.action.cancel')}
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
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
            {t('home.archive.stepWiki')}
          </div>
          {wikis.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('home.wiki.empty')} />
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
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
            {t('home.archive.stepDirectory')}
          </div>
          {selectedWikiId == null ? (
            <div style={{ color: token.colorTextTertiary, fontSize: 12.5 }}>
              {t('home.archive.selectWikiFirst')}
            </div>
          ) : dirsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
              <Spin size="small" />
            </div>
          ) : directories.length === 0 ? (
            <div style={{ color: token.colorTextTertiary, fontSize: 12.5 }}>
              {t('home.archive.noDirectories')}
            </div>
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
