import { getDatabaseInstance } from '../../index'
import logger from 'electron-log'

export interface TodoItemRow {
  id: number
  title: string
  description: string
  due_date: string | null
  priority: number
  status: number
  category: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
  started_at: string | null
}

// --- 根据 id 查询 ---
async function getTodoItemById(id: number): Promise<TodoItemRow[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'SELECT * FROM todo_items WHERE id = $1'
    const result = await db.query<TodoItemRow>(sql, [id])
    logger.info(`Query by id=${id} returned ${result.rows.length} rows.`)
    return result.rows
  } catch (error) {
    logger.error('Failed to get todo item by id:', error)
    throw error
  }
}

// --- 根据 title 查询 ---
async function getTodoItemByTitle(title: string): Promise<TodoItemRow[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'SELECT * FROM todo_items WHERE title = $1'
    const result = await db.query<TodoItemRow>(sql, [title])
    logger.info(`Query by title="${title}" returned ${result.rows.length} rows.`)
    return result.rows
  } catch (error) {
    logger.error('Failed to get todo item by title:', error)
    throw error
  }
}

// --- 根据 priority 查询 ---
async function getTodoItemsByPriority(priority: number): Promise<TodoItemRow[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'SELECT * FROM todo_items WHERE priority = $1 ORDER BY due_date ASC'
    const result = await db.query<TodoItemRow>(sql, [priority])
    logger.info(`Query by priority=${priority} returned ${result.rows.length} rows.`)
    return result.rows
  } catch (error) {
    logger.error('Failed to get todo items by priority:', error)
    throw error
  }
}

// --- 根据 status 查询 ---
async function getTodoItemsByStatus(status: number): Promise<TodoItemRow[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'SELECT * FROM todo_items WHERE status = $1 ORDER BY priority ASC, due_date ASC'
    const result = await db.query<TodoItemRow>(sql, [status])
    logger.info(`Query by status=${status} returned ${result.rows.length} rows.`)
    return result.rows
  } catch (error) {
    logger.error('Failed to get todo items by status:', error)
    throw error
  }
}

// --- 获取所有待办事项 ---
async function getAllTodoItems(): Promise<TodoItemRow[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'SELECT * FROM todo_items ORDER BY priority ASC, due_date ASC'
    const result = await db.query<TodoItemRow>(sql)
    logger.info(`Query for all todo items returned ${result.rows.length} rows.`)
    return result.rows
  } catch (error) {
    logger.error('Failed to get all todo items:', error)
    throw error
  }
}

// --- 根据 due_date 查询 ---
async function getTodoItemsByDueDate(dueDate: string): Promise<TodoItemRow[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'SELECT * FROM todo_items WHERE due_date = $1 ORDER BY priority ASC'
    const result = await db.query<TodoItemRow>(sql, [dueDate])
    logger.info(`Query by due_date="${dueDate}" returned ${result.rows.length} rows.`)
    return result.rows
  } catch (error) {
    logger.error('Failed to get todo items by due date:', error)
    throw error
  }
}

// --- 根据 category 查询 ---
async function getTodoItemsByCategory(category: string): Promise<TodoItemRow[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'SELECT * FROM todo_items WHERE category = $1 ORDER BY priority ASC, due_date ASC'
    const result = await db.query<TodoItemRow>(sql, [category])
    logger.info(`Query by category="${category}" returned ${result.rows.length} rows.`)
    return result.rows
  } catch (error) {
    logger.error('Failed to get todo items by category:', error)
    throw error
  }
}

// --- 添加待办事项 ---
async function addTodoItem(
  todoItem: Omit<TodoItemRow, 'id' | 'created_at' | 'updated_at'>
): Promise<number> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const { title, description, due_date, priority, status, category, started_at } = todoItem
    const sql =
      'INSERT INTO todo_items (title, description, due_date, priority, status, category, started_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id'

    const result = await db.query<{ id: number }>(sql, [
      title,
      description,
      due_date,
      priority,
      status,
      category,
      started_at
    ])
    const newId = result.rows[0].id
    logger.info(`Inserted new todo item with ID: ${newId}`)
    return newId
  } catch (error) {
    logger.error('Failed to insert todo item:', error)
    throw error
  }
}

// --- 修改待办事项 ---
async function updateTodoItem(
  id: number,
  updates: Partial<Omit<TodoItemRow, 'id' | 'created_at'>>
): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()

    const updateFields: string[] = []
    const updateValues: (string | number | null)[] = []
    let paramIndex = 1

    if (updates.title !== undefined) {
      updateFields.push(`title = $${paramIndex++}`)
      updateValues.push(updates.title)
    }
    if (updates.description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`)
      updateValues.push(updates.description)
    }
    if (updates.due_date !== undefined) {
      updateFields.push(`due_date = $${paramIndex++}`)
      updateValues.push(updates.due_date)
    }
    if (updates.priority !== undefined) {
      updateFields.push(`priority = $${paramIndex++}`)
      updateValues.push(updates.priority)
    }
    if (updates.status !== undefined) {
      updateFields.push(`status = $${paramIndex++}`)
      updateValues.push(updates.status)
      if (updates.status === 2) {
        updateFields.push('completed_at = NOW()')
      }
      if (updates.status === 1) {
        updateFields.push('started_at = NOW()')
      }
    }
    if (updates.category !== undefined) {
      updateFields.push(`category = $${paramIndex++}`)
      updateValues.push(updates.category)
    }
    if (updates.started_at !== undefined) {
      updateFields.push(`started_at = $${paramIndex++}`)
      updateValues.push(updates.started_at)
    }
    if (updates.updated_at !== undefined) {
      updateFields.push(`updated_at = $${paramIndex++}`)
      updateValues.push(updates.updated_at)
    } else {
      updateFields.push('updated_at = NOW()')
    }

    if (updateFields.length === 0) {
      logger.warn('No fields to update for todo item with id:', id)
      return false
    }

    const sql = `UPDATE todo_items SET ${updateFields.join(', ')} WHERE id = $${paramIndex++}`
    updateValues.push(id)

    const result = await db.query(sql, updateValues)
    const changes = result.affectedRows ?? 0
    if (changes > 0) {
      logger.info(`Updated todo item with ID: ${id}, ${changes} row(s) affected.`)
      return true
    } else {
      logger.warn(`No rows updated for todo item with ID: ${id}`)
      return false
    }
  } catch (error) {
    logger.error('Failed to update todo item:', error)
    throw error
  }
}

// --- 删除待办事项 ---
async function deleteTodoItem(id: number): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'DELETE FROM todo_items WHERE id = $1'
    const result = await db.query(sql, [id])
    const changes = result.affectedRows ?? 0
    if (changes > 0) {
      logger.info(`Deleted todo item with ID: ${id}, ${changes} row(s) affected.`)
      return true
    } else {
      logger.warn(`No rows deleted for todo item with ID: ${id}`)
      return false
    }
  } catch (error) {
    logger.error('Failed to delete todo item:', error)
    throw error
  }
}

export {
  getTodoItemById,
  getTodoItemByTitle,
  getTodoItemsByPriority,
  getTodoItemsByStatus,
  getAllTodoItems,
  getTodoItemsByDueDate,
  getTodoItemsByCategory,
  addTodoItem,
  updateTodoItem,
  deleteTodoItem
}
