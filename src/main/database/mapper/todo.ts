import { getDatabaseInstance } from '../../index'
import logger from 'electron-log'
import * as sqlite3 from 'sqlite3'

export interface TodoItemRow {
  id: number
  title: string
  description: string
  due_date: string
  priority: number
  completed: boolean
}

// --- 根据 id 查询 ---
async function getTodoItemById(id: number): Promise<TodoItemRow[]> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()

    // 使用参数化查询，? 是占位符
    const sql = 'SELECT * FROM todo_items WHERE id = ?'

    return new Promise((resolve, reject) => {
      db!.all(sql, [id], (err, rows: TodoItemRow[]) => {
        if (err) {
          logger.error('Error executing query by id:', err.message)
          reject(err)
        } else {
          logger.info(`Query by id=${id} returned ${rows.length} rows.`)
          resolve(rows)
        }
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for id query:', error)
    throw error // 重新抛出错误，以便调用者处理
  }
}

// --- 根据 title 查询 ---
async function getTodoItemByTitle(title: string): Promise<TodoItemRow[]> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()

    // 使用参数化查询，? 是占位符
    const sql = 'SELECT * FROM todo_items WHERE title = ?'

    return new Promise((resolve, reject) => {
      db!.all(sql, [title], (err, rows: TodoItemRow[]) => {
        if (err) {
          logger.error('Error executing query by title:', err.message)
          reject(err)
        } else {
          logger.info(`Query by title="${title}" returned ${rows.length} rows.`)
          resolve(rows)
        }
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for title query:', error)
    throw error
  }
}

// --- 根据 priority 查询 ---
async function getTodoItemsByPriority(priority: number): Promise<TodoItemRow[]> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()

    // 使用参数化查询，? 是占位符
    const sql = 'SELECT * FROM todo_items WHERE priority = ? ORDER BY due_date ASC'

    return new Promise((resolve, reject) => {
      db!.all(sql, [priority], (err, rows: TodoItemRow[]) => {
        if (err) {
          logger.error('Error executing query by priority:', err.message)
          reject(err)
        } else {
          logger.info(`Query by priority=${priority} returned ${rows.length} rows.`)
          resolve(rows)
        }
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for priority query:', error)
    throw error
  }
}

// --- 根据 completed 状态查询 ---
async function getTodoItemsByCompletedStatus(completed: boolean): Promise<TodoItemRow[]> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()

    // 使用参数化查询，? 是占位符
    const sql = 'SELECT * FROM todo_items WHERE completed = ? ORDER BY priority ASC, due_date ASC'

    return new Promise((resolve, reject) => {
      db!.all(sql, [completed ? 1 : 0], (err, rows: TodoItemRow[]) => {
        if (err) {
          logger.error('Error executing query by completed status:', err.message)
          reject(err)
        } else {
          logger.info(`Query by completed=${completed} returned ${rows.length} rows.`)
          resolve(rows)
        }
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for completed status query:', error)
    throw error
  }
}

// --- 获取所有待办事项 ---
async function getAllTodoItems(): Promise<TodoItemRow[]> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()

    // 使用参数化查询，? 是占位符
    const sql = 'SELECT * FROM todo_items ORDER BY priority ASC, due_date ASC'

    return new Promise((resolve, reject) => {
      db!.all(sql, [], (err, rows: TodoItemRow[]) => {
        if (err) {
          logger.error('Error executing query for all todo items:', err.message)
          reject(err)
        } else {
          logger.info(`Query for all todo items returned ${rows.length} rows.`)
          resolve(rows)
        }
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for all todo items query:', error)
    throw error
  }
}

// --- 根据 due_date 查询 ---
async function getTodoItemsByDueDate(dueDate: string): Promise<TodoItemRow[]> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()

    // 使用参数化查询，? 是占位符
    const sql = 'SELECT * FROM todo_items WHERE due_date = ? ORDER BY priority ASC'

    return new Promise((resolve, reject) => {
      db!.all(sql, [dueDate], (err, rows: TodoItemRow[]) => {
        if (err) {
          logger.error('Error executing query by due date:', err.message)
          reject(err)
        } else {
          logger.info(`Query by due_date="${dueDate}" returned ${rows.length} rows.`)
          resolve(rows)
        }
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for due date query:', error)
    throw error
  }
}

// --- 添加待办事项 ---
async function addTodoItem(todoItem: Omit<TodoItemRow, 'id'>): Promise<number> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()

    const { title, description, due_date, priority, completed } = todoItem
    const sql =
      'INSERT INTO todo_items (title, description, due_date, priority, completed) VALUES (?, ?, ?, ?, ?)'

    return new Promise((resolve, reject) => {
      db!.run(sql, [title, description, due_date, priority, completed ? 1 : 0], function (err) {
        if (err) {
          logger.error('Error inserting todo item:', err.message)
          reject(err)
        } else {
          logger.info(`Inserted new todo item with ID: ${this.lastID}`)
          resolve(this.lastID) // 返回新插入记录的ID
        }
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for inserting todo item:', error)
    throw error
  }
}

// --- 修改待办事项 ---
async function updateTodoItem(
  id: number,
  updates: Partial<Omit<TodoItemRow, 'id'>>
): Promise<boolean> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()

    // 构建动态更新SQL语句
    const updateFields: string[] = []
    const updateValues: (string | number | boolean)[] = []

    if (updates.title !== undefined) {
      updateFields.push('title = ?')
      updateValues.push(updates.title)
    }
    if (updates.description !== undefined) {
      updateFields.push('description = ?')
      updateValues.push(updates.description)
    }
    if (updates.due_date !== undefined) {
      updateFields.push('due_date = ?')
      updateValues.push(updates.due_date)
    }
    if (updates.priority !== undefined) {
      updateFields.push('priority = ?')
      updateValues.push(updates.priority)
    }
    if (updates.completed !== undefined) {
      updateFields.push('completed = ?')
      updateValues.push(updates.completed ? 1 : 0)
    }

    if (updateFields.length === 0) {
      logger.warn('No fields to update for todo item with id:', id)
      return false
    }

    const sql = `UPDATE todo_items SET ${updateFields.join(', ')} WHERE id = ?`
    updateValues.push(id)

    return new Promise((resolve, reject) => {
      db!.run(sql, updateValues, function (err) {
        if (err) {
          logger.error('Error updating todo item:', err.message)
          reject(err)
        } else {
          const changes = this.changes
          if (changes > 0) {
            logger.info(`Updated todo item with ID: ${id}, ${changes} row(s) affected.`)
            resolve(true)
          } else {
            logger.warn(`No rows updated for todo item with ID: ${id}`)
            resolve(false)
          }
        }
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for updating todo item:', error)
    throw error
  }
}

// --- 删除待办事项 ---
async function deleteTodoItem(id: number): Promise<boolean> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()

    const sql = 'DELETE FROM todo_items WHERE id = ?'

    return new Promise((resolve, reject) => {
      db!.run(sql, [id], function (err) {
        if (err) {
          logger.error('Error deleting todo item:', err.message)
          reject(err)
        } else {
          const changes = this.changes
          if (changes > 0) {
            logger.info(`Deleted todo item with ID: ${id}, ${changes} row(s) affected.`)
            resolve(true)
          } else {
            logger.warn(`No rows deleted for todo item with ID: ${id}`)
            resolve(false)
          }
        }
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for deleting todo item:', error)
    throw error
  }
}

export {
  getTodoItemById,
  getTodoItemByTitle,
  getTodoItemsByPriority,
  getTodoItemsByCompletedStatus,
  getAllTodoItems,
  getTodoItemsByDueDate,
  addTodoItem,
  updateTodoItem,
  deleteTodoItem
}
