import React, { useState, useEffect } from 'react'
import { Modal, Progress, Typography, Space, Button, Image, theme } from 'antd'
import {
  FileTextOutlined,
  PictureOutlined,
  UploadOutlined,
  LoadingOutlined
} from '@ant-design/icons'
import { Window } from '../../resource/types/window'

const { Text } = Typography

interface ImportNovelModalProps {
  open: boolean
  onCancel: () => void
  onImportComplete: () => void
}

const ImportNovelModal: React.FC<ImportNovelModalProps> = ({
  open,
  onCancel,
  onImportComplete
}) => {
  const {
    token: { colorFillAlter }
  } = theme.useToken()

  const [filePath, setFilePath] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [progress, setProgress] = useState({ processedNotes: 0, totalNotes: 0, message: '' })

  useEffect(() => {
    if (!open) {
      setFilePath(null)
      setFileName('')
      setCoverDataUrl(null)
      setIsImporting(false)
      setProgress({ processedNotes: 0, totalNotes: 0, message: '' })
    }
  }, [open])

  const handleSelectFile = async (): Promise<void> => {
    const result = await (window as unknown as Window).api.file.selectTextFile()
    if (result) {
      setFilePath(result.filePath)
      setFileName(result.fileName)
    }
  }

  const handleSelectCover = async (): Promise<void> => {
    const result = await (window as unknown as Window).api.file.selectImageFile(true)
    if (result?.isImage) {
      setCoverDataUrl(result.dataUrl)
    }
  }

  const handleStartImport = async (): Promise<void> => {
    if (!filePath) return

    setIsImporting(true)

    const unsubscribe = (window as unknown as Window).api.file.onImportNovelProgress((p) => {
      setProgress(p)
    })

    try {
      await (window as unknown as Window).api.file.importNovel({
        filePath,
        coverDataUrl
      })
      onImportComplete()
      onCancel()
    } catch (error) {
      console.error('Import failed:', error)
    } finally {
      unsubscribe()
      setIsImporting(false)
    }
  }

  const percent =
    progress.totalNotes > 0 ? Math.round((progress.processedNotes / progress.totalNotes) * 100) : 0

  return (
    <Modal
      title={
        <Space>
          {isImporting ? <LoadingOutlined /> : <UploadOutlined />}
          <span>导入小说</span>
        </Space>
      }
      open={open}
      onCancel={onCancel}
      footer={null}
      closable={!isImporting}
      mask={{ closable: !isImporting }}
      width={440}
    >
      {!isImporting ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: colorFillAlter,
              borderRadius: 8
            }}
          >
            <Space>
              <FileTextOutlined style={{ fontSize: 18, color: '#1677ff' }} />
              <div>
                <div style={{ fontWeight: 500 }}>选择文件</div>
                {fileName && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {fileName}
                  </Text>
                )}
              </div>
            </Space>
            <Button onClick={handleSelectFile}>{fileName ? '重新选择' : '选择文件'}</Button>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: colorFillAlter,
              borderRadius: 8
            }}
          >
            <Space>
              <PictureOutlined style={{ fontSize: 18, color: '#1677ff' }} />
              <div>
                <div style={{ fontWeight: 500 }}>选择封面（可选）</div>
                {coverDataUrl && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    已选择封面
                  </Text>
                )}
              </div>
            </Space>
            <Button onClick={handleSelectCover}>{coverDataUrl ? '重新选择' : '选择封面'}</Button>
          </div>

          {coverDataUrl && (
            <div style={{ textAlign: 'center' }}>
              <Image
                src={coverDataUrl}
                alt="封面预览"
                style={{ maxHeight: 160, borderRadius: 8, objectFit: 'cover' }}
                preview={false}
              />
            </div>
          )}

          <Button
            type="primary"
            icon={<UploadOutlined />}
            onClick={handleStartImport}
            disabled={!filePath}
            block
            size="large"
          >
            开始导入
          </Button>
        </div>
      ) : (
        <div style={{ padding: '16px 0' }}>
          <Progress
            percent={percent}
            status="active"
            strokeColor="#1677ff"
            style={{ marginBottom: 16 }}
          />

          <Text type="secondary" style={{ fontSize: 13 }}>
            {progress.message}
          </Text>

          {progress.totalNotes > 0 && (
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                已导入 {progress.processedNotes}/{progress.totalNotes} 个章节
              </Text>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

export default ImportNovelModal
