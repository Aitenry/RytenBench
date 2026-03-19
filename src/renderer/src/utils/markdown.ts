import React from 'react'

export const extractTextFromChildren = (children: React.ReactNode | string): string => {
  if (typeof children === 'string') {
    return children
  }

  if (Array.isArray(children)) {
    return children.map(extractTextFromChildren).join('')
  }

  if (children && typeof children === 'object' && React.isValidElement(children)) {
    const element = children as React.ReactElement<{ children?: React.ReactNode }>
    return extractTextFromChildren(element.props.children)
  }

  return ''
}
