import React from 'react'
import { Tree, Space, Modal } from 'antd'
import { FolderOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { DirectoryWithChildren } from '../types'
import type { DirectoryTreeProps } from '@renderer/types/components'
import type { TreeNodeData } from '@renderer/types/knowledge'

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
  const handleDeleteClick = (e: React.MouseEvent, node: DirectoryWithChildren): void => {
    e.stopPropagation()
    Modal.confirm({
      title: '确定要删除这个目录吗？',
      onOk: () => onDeleteDirectory(node),
      okText: '确定',
      cancelText: '取消'
    })
  }

  const buildTreeData = (nodes: DirectoryWithChildren[]): TreeNodeData[] => {
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
