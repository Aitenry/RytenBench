import React from 'react'
import { Tree, Space, Modal } from 'antd'
import { FolderOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { DirectoryWithChildren } from '../types'

interface DirectoryTreeProps {
  directoryTree: DirectoryWithChildren[]
  expandedKeys: React.Key[]
  onExpand: (keys: React.Key[]) => void
  onSelect: (keys: React.Key[]) => void
  selectedKeys: React.Key[]
  onCreateDirectory: (parentId: number) => void
  onEditDirectory: (dir: DirectoryWithChildren) => void
  onDeleteDirectory: (dir: DirectoryWithChildren) => void
}

const DirectoryTree: React.FC<DirectoryTreeProps> = ({
  directoryTree,
  expandedKeys,
  onExpand,
  onSelect,
  selectedKeys,
  onCreateDirectory,
  onEditDirectory,
  onDeleteDirectory
}) => {
  const handleDeleteClick = (e: React.MouseEvent, node: DirectoryWithChildren) => {
    e.stopPropagation()
    Modal.confirm({
      title: '确定要删除这个目录吗？',
      onOk: () => onDeleteDirectory(node),
      okText: '确定',
      cancelText: '取消'
    })
  }

  const buildTreeData = (nodes: DirectoryWithChildren[]): any[] => {
    return nodes.map((node) => ({
      key: node.id,
      title: (
        <Space>
          <FolderOutlined />
          <span>{node.name}</span>
          <Space size="small">
            <PlusOutlined
              onClick={(e) => {
                e.stopPropagation()
                onCreateDirectory(node.id)
              }}
            />
            <EditOutlined
              onClick={(e) => {
                e.stopPropagation()
                onEditDirectory(node)
              }}
            />
            <DeleteOutlined onClick={(e) => handleDeleteClick(e, node)} />
          </Space>
        </Space>
      ),
      children: node.children && node.children.length > 0 ? buildTreeData(node.children) : undefined
    }))
  }

  return (
    <Tree
      showLine
      treeData={buildTreeData(directoryTree)}
      expandedKeys={expandedKeys}
      onExpand={onExpand}
      onSelect={onSelect}
      selectedKeys={selectedKeys}
    />
  )
}

export default DirectoryTree
